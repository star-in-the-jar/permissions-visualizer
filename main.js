const { Client } = require('pg');

const TAB_CHAR = '  '
const SPACE_CHAR = ' '
const VERTICAL_BRANCH_CHAR = '│'
const MIDDLE_BRANCH_CHAR = '├─'
const TOP_BRANCH_CHAR = '┌─'
const BOTTOM_BRANCH_CHAR = '└─'
const HORIZONTAL_BRANCH_CHAR = '─'
const RIGHT_TOP_BRANCH_CHAR = '┐'

const client = new Client({
    user: 'runbotics',
    host: '127.0.0.1',
    database: 'runbotics',
    password: '',
    port: 5432
});

async function getAuthorityFeatureKey() {
    await client.connect();

    // const roles = await client.query('SELECT name FROM jhi_authority').then(res => res.rows.map(row => row.name))

    const authorityFeatureKey = await client
        .query('SELECT authority, feature_key FROM authority_feature_key')
        .then(res => res.rows.reduce((acc, row) => {
            const authority = row.authority;
            const featureKey = row.feature_key;

            return {
                ...acc,
                [row.authority]: [...(acc[authority] ? acc[authority] : []), featureKey]
            }
        }, {}));

    await client.end();

    return authorityFeatureKey
}

const checkIsSubset = (a, b) => {
    return a.every(val => b.includes(val));
}

const displayDiff = (treeNodes) => {
    treeNodes.forEach((treeNode, idx) => {
        if (idx === treeNodes.length - 1) return;
        // console.log(treeNode.authority + ' - ' + treeNodes[idx + 1]?.authority + ':')
        // console.log('')
        // console.log(getSetsDiff(treeNode.fks, treeNodes[idx + 1]?.fks).map(fk => TAB_CHAR.repeat(2) + fk).join('\n'))
        // console.log('')
        console.log(treeNodes[idx + 1]?.authority + ' - ' + treeNode.authority + ':')
        console.log(getSetsDiff(treeNodes[idx + 1]?.fks, treeNode.fks).map(fk => fk))
        console.log('')


    })
}

const drawChildTree = (treeNode, level, all) => {
    const branchChar = level === 0 ? TOP_BRANCH_CHAR : MIDDLE_BRANCH_CHAR
    console.log(TAB_CHAR.repeat(level) + branchChar + treeNode.authority)
    if (treeNode.newFks) {
        treeNode.newFks.forEach((fk, idx) => {
            const isLast = treeNode.newFks.length - 1 === idx
            console.log(TAB_CHAR.repeat(level) + VERTICAL_BRANCH_CHAR + TAB_CHAR.repeat(4) + fk)
            if (isLast) {
                const isLastChild = !treeNode.subsets || treeNode.subsets.length === 0
                if (!isLastChild)
                    console.log(TAB_CHAR.repeat(level) + BOTTOM_BRANCH_CHAR + HORIZONTAL_BRANCH_CHAR.repeat(2) + RIGHT_TOP_BRANCH_CHAR)
                else console.log(TAB_CHAR.repeat(level) + HORIZONTAL_BRANCH_CHAR.repeat(0) + VERTICAL_BRANCH_CHAR)
            }
        })
    }
    if (treeNode.subsets) {
        treeNode.subsets.forEach((subset) => {
            // console.log("CHILDREN IS BEING DRAWN:")
            drawChildTree(all.find(
                node => node.authority === subset
            ), level + 2, all)
        })
    }
}

const getSetsDiff = (aKeys, bKeys) => {
    return aKeys.filter(aKey => !bKeys.includes(aKey))
}

const main = async () => {
    const authorityFeatureKey = await getAuthorityFeatureKey()
        .then(res => Object.fromEntries(
            Object.entries(res).map(([key, value]) => [key, [...value].sort()])
        ))

    const roles = Object.keys(authorityFeatureKey);

    const fksByAuthority = Object.entries(authorityFeatureKey).map(([authority, fks]) => {
        const subsets = roles.reduce((acc, role) => {
            if (role === authority) return acc;
            if (checkIsSubset(authorityFeatureKey[role], fks)) {
                return [...acc, role]
            }
            return acc;
        }, [])

        const fksWithoutSubsets = subsets.reduce((acc, role) => {
            return acc.filter(fk => !authorityFeatureKey[role].includes(fk))
        }, fks);

        return {
            authority,
            subsets,
            newFks: fksWithoutSubsets,
            fks,
        }
    })

    // const subsetsByAuthority = fksByAuthority.map(fk => ({ authority: fk.authority, subsets: fk.subsets }));

    const onlyNotContainedInOwn = fksByAuthority.map(({ subsets, authority, newFks, fks }) => {
        const currentRowSubsets = [...subsets]
        const isOtherRowSubset = (subset) => fksByAuthority.some(sba => sba.subsets.includes(subset) && sba.authority !== authority && currentRowSubsets.includes(sba.authority))

        const notContainedInOwnSubsets = subsets.filter((subset) => {
            return !isOtherRowSubset(subset)
        })

        return ({
            authority,
            subsets: notContainedInOwnSubsets,
            newFks,
            fks,
        })
    })

    drawChildTree(onlyNotContainedInOwn.find(set => set.authority === 'ROLE_ADMIN'), 0, onlyNotContainedInOwn)

    // displayDiff(sortByMasterSet)
}

main();

