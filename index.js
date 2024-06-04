require('dotenv').config()
const { Client } = require('pg');

const TAB_CHAR = '  '
const SPACE_CHAR = ' '
const VERTICAL_BRANCH_CHAR = '│'
const MIDDLE_BRANCH_CHAR = '├─'
const TOP_BRANCH_CHAR = '┌─'
const BOTTOM_BRANCH_CHAR = '└─'
const HORIZONTAL_BRANCH_CHAR = '─'
const RIGHT_TOP_BRANCH_CHAR = '┐'

const clients = {
    local: {
        user: process.env.LOCAL_DB_USER,
        host: process.env.LOCAL_DB_HOST,
        database: process.env.LOCAL_DB_NAME,
        password: process.env.LOCAL_DB_PASSWORD,
        port: process.env.LOCAL_DB_PORT
    },
    dev: {
        user: process.env.DEV_DB_USER,
        host: process.env.DEV_DB_HOST,
        database: process.env.DEV_DB_NAME,
        password: process.env.DEV_DB_PASSWORD,
        port: process.env.DEV_DB_PORT
    },
}

const getConnectedClient = (server) => {
    if (!server) {
        console.log('Server is not provided. Avaiable servers are: ', Object.keys(clients).join(', '))
    }
    return new Client(clients[server])
}

async function getAuthorityFeatureKey(client) {
    // const roles = await client.query('SELECT name FROM jhi_authority').then(res => res.rows.map(row => row.name))

    await client.connect();

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
    const target = process.argv.includes('-t') ? process.argv[process.argv.indexOf('-t') + 1] : 'local'
    const client = getConnectedClient(target)

    const authorityFeatureKey = await getAuthorityFeatureKey(client)
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

    if (process.argv.includes('--showDiff')) {
        displayDiff(onlyNotContainedInOwn)
    }
}

main()