
const vscode = require('vscode');
const extensionId = 'lz-scripts';
/**
 * 
 * @param {string} query
 */
async function runForInsert( query) {
    let allowIdentity = vscode.workspace.getConfiguration('LzScripts').get('addIdentityColumns') === true;
    let allowMultipleInsert = vscode.workspace.getConfiguration('LzScripts').get('allowInsertPerRow') === true;
    let insetStr = [];

    let tableInfos = extractTableInfo(query);
    let tableInfo = tableInfos.length > 0 ? tableInfos[0] : {};
    let table = IsEmptyObj(tableInfo)  ? '' : tableInfo.table.replaceAll('[','').replaceAll(']','');

    const mssqlApi = await getMssqlApi();
    const connectionUri = await connectToActiveEditor();
    if (!connectionUri) return;

    const serverInfo = await mssqlApi.connectionSharing.getServerInfo(connectionUri);
    let currentDb = serverInfo?.databaseName;

    if (!currentDb) {
    const databases = await mssqlApi.connectionSharing.listDatabases(connectionUri);
    const selectedDb = await vscode.window.showQuickPick(databases, {
        placeHolder: "Select a database to use",
    });
    currentDb = selectedDb;
    }

    console.log(table);
    let qstr = `IF EXISTS (SELECT 1 
        FROM INFORMATION_SCHEMA.TABLES 
        WHERE TABLE_TYPE='BASE TABLE' 
        AND TABLE_NAME='${table}') 
        SELECT 1 AS res ELSE SELECT 0 AS res;`;
    let tblres = await runSqlQuery(qstr,currentDb,connectionUri);
    let tblExist = tblres.rows[0][0].displayValue === "1";
    if (!tblExist)
        throw new Error('Target Table not found');


    let data = await runSqlQuery(query,currentDb,connectionUri);
    if (data.rowCount == 0)
        throw new Error('No records found');

    let ins = 'insert into ' + tableInfo.full + ' (';

    //--> get cols except identity , autogen cols
    for (let i = 0; i < data.columnInfo.length; i++) {
        if (data.columnInfo[i].isIdentity === true && !allowIdentity)
            continue;

        if (data.columnInfo[i].dataTypeName !== 'timestamp')
            ins += (' [' + data.columnInfo[i].columnName + '] ,');
    }
    //--> remove last comma
    ins = ins.slice(0, ins.length - 1);
    ins = ins + ') \n';
    //--> look at data

    if (allowMultipleInsert) {
        for (let row = 0; row < data.rowCount; row++) {
            let dataStr = 'values ('
            for (let col = 0; col < data.columnInfo.length; col++) {

                if (data.columnInfo[col].isIdentity === true && !allowIdentity)
                    continue;

                if (data.columnInfo[col].dataTypeName !== 'timestamp')
                    dataStr += (`/* ${data.columnInfo[col].columnName} */ ` + (
                        data.rows[row][col].isNull === true ? 'null' :
                            getValue(data.rows[row][col].displayValue, data.columnInfo[col]))
                        + ' ,');
            }

            dataStr = dataStr.slice(0, dataStr.length - 1);
            dataStr = dataStr + '); \n ';
            insetStr.push(ins + dataStr);
        }
    } 
    else
    {
        let dataStr = 'values '
        for (let row = 0; row < data.rowCount; row++) {
            dataStr += '( '
            for (let col = 0; col < data.columnInfo.length; col++) {

                if (data.columnInfo[col].isIdentity === true && !allowIdentity)
                    continue;

                if (data.columnInfo[col].dataTypeName !== 'timestamp')
                    dataStr += (`/* ${data.columnInfo[col].columnName} */ ` + (
                        data.rows[row][col].isNull === true ? 'null' :
                            getValue(data.rows[row][col].displayValue, data.columnInfo[col]))
                        + ' ,');
            }

            dataStr = dataStr.slice(0, dataStr.length - 1);
            dataStr = dataStr + ' ), \n';
        }
        //--> we remove 3 because we don't need the last \n
        insetStr.push(ins + dataStr.slice(0, dataStr.length - 3) + ';');
    }


    return PostProcessing(insetStr, tableInfo.full, vscode.workspace.getConfiguration('LzScripts'));
}


/**
 * @param {string[]} insetStr
 * @param {vscode.WorkspaceConfiguration} config
 * @param {string} table
 */
function PostProcessing(insetStr, table, config) {
    let allowIdentity = config.get('addIdentityColumns') === true;
    if (allowIdentity) {
        insetStr.unshift(`set identity_insert ${table} on; \ngo; \n`);
        insetStr.push(`set identity_insert ${table} off; \ngo; \n`);
    }

    return insetStr;
}



async function getMssqlApi() {
  const extension = vscode.extensions.getExtension('ms-mssql.mssql');
  if (!extension) {
    vscode.window.showErrorMessage('vscode-mssql extension not found');
    return null;
  }

  if (!extension.isActive) {
    await extension.activate();
  }

  return extension.exports;
}
async function connectToActiveEditor() {
  const mssqlApi = await getMssqlApi();
  const connectionId = await getActiveConnectionId();
  if (!connectionId) {
    vscode.window.showErrorMessage('No active connection found');
    return null;
  }

  const connectionUri = await mssqlApi.connectionSharing.connect(extensionId, connectionId);
  return connectionUri;
}
async function runSqlQuery(queryText,db2use,connectionUri) {
    const mssqlApi = await getMssqlApi();
    const queryTextWithDb = db2use ? `USE [${db2use}]; ${queryText}` : queryText;

  if (!queryTextWithDb) {
    vscode.window.showErrorMessage('No query text provided');
    return null;
  }

  const result = await mssqlApi.connectionSharing.executeSimpleQuery(connectionUri, queryTextWithDb);
  console.log('Query Result:', result);
  return result;
}
async function getActiveConnectionId() {
  const mssqlApi = await getMssqlApi();
  if (!mssqlApi) return null;

  // Replace with your actual extension ID
  const connectionId = await mssqlApi.connectionSharing.getActiveEditorConnectionId(extensionId);
  return connectionId;
}


function getValue(displayValue, colinfo) {
    switch (colinfo.dataTypeName) {
        case "int": case "bigint": case "bit": case "binary": case "tinyint":
            return parseInt(displayValue);
        case "money": case "decimal": case "float": case "smallmoney": case "numeric":
            return parseFloat(displayValue);
        case "nvarchar":
            return `N'${displayValue.replaceAll("'", "''")}'`;
        case "image":
            return `cast('${displayValue}' as image)`;
        case "varbinary":
            return `cast('${displayValue}' as varbinary(${colinfo.columnSize})`;
        default:
            return `'${displayValue.replaceAll("'", "''")}'`;

    }
}

function IsEmptyObj(obj)
{
    for(var i in obj) 
        return false; 
    return true;
}

function extractTableInfo(sql) {
    let regex = /\bFROM\s+([\w\.\[\]]+)|\bJOIN\s+([\w\.\[\]]+)|\bUPDATE\s+([\w\.\[\]]+)|\bINTO\s+([\w\.\[\]]+)/ig;
    let match;
    let tables = [];

    while ((match = regex.exec(sql)) !== null) {
        let table = match.slice(1).find(m => m);
        if (table) {
            let parts = table.split(".");
            let tableInfoObj = {};

            if (parts.length === 3) {
                tableInfoObj.database = parts[0];
                tableInfoObj.schema = parts[1];
                tableInfoObj.table = parts[2];
                tableInfoObj.full = `${parts[0]}.${parts[1]}.${parts[2]}`;
            } else if (parts.length === 2) {
                tableInfoObj.schema = parts[0];
                tableInfoObj.table = parts[1];
                tableInfoObj.full = `${parts[0]}.${parts[1]}`;
            } else {
                tableInfoObj.table = parts[0];
                tableInfoObj.full = `${parts[0]}`;
            }

            tables.push(tableInfoObj);
        }
    }

    return tables;
}

module.exports.runForInsert = runForInsert;




