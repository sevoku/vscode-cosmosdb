/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IActionContext } from "@microsoft/vscode-azext-utils";
import * as vscode from "vscode";
import { KeyValueStore } from "../../KeyValueStore";
import { localize } from "../../utils/localize";
import { NoSqlQueryConnection, noSqlQueryConnectionKey } from "../NoSqlCodeLensProvider";
import ViewLoader, { ViewLoaderOptions } from "../QueryClient/ViewLoader";
//import { AppContext } from "../QueryClient/AppContext";
import { ext } from '../../extensionVariables';
import * as vscodeUtil from "../../utils/vscodeUtils";
import { EditorUserQuery } from "../QueryClient/messageContract";
import { getCosmosClient } from "../getCosmosClient";
import { DocDBCollectionTreeItem } from "../tree/DocDBCollectionTreeItem";
import { setConnectedNoSqlContainer } from "./connectNoSqlContainer";
import { pickDocDBAccount } from "./pickDocDBAccount";


function getViewLoader(
    server: string,
    databaseName: string,
    containerName: string,
    options: ViewLoaderOptions
): ViewLoader {
    const key = buildCacheKey(server, databaseName, containerName);
    if (!_viewLoaders.has(key)) {
        _viewLoaders.set(key, new ViewLoader(options));
    }

    return _viewLoaders.get(key)!;
}

function removeViewLoader(server: string, databaseName: string, containerName: string): void {
    const key = buildCacheKey(server, databaseName, containerName);
    if (_viewLoaders.has(key)) {
        _viewLoaders.delete(key);
    }
}

function buildCacheKey(server: string, databaseName: string, containerName: string): string {
    return `${server}_${databaseName}_${containerName}`;
}
// Cache view loader per container
const _viewLoaders: Map<string, ViewLoader> = new Map<string, ViewLoader>();

/*
export async function writeNoSqlQuery(context: IActionContext, node?: DocDBCollectionTreeItem): Promise<void> {
    if (!node) {
        node = await pickDocDBAccount<DocDBCollectionTreeItem>(context, DocDBCollectionTreeItem.contextValue);
    }
    setConnectedNoSqlContainer(node);
    const sampleQuery = `SELECT * FROM ${node.id}`;
    await vscodeUtil.showNewFile(sampleQuery, `query for ${node.label}`, ".nosql");
}
*/

export async function openNoSqlQuery(_context: IActionContext, _node?: DocDBCollectionTreeItem): Promise<void> {
    if (!_node) {
        _node = await pickDocDBAccount<DocDBCollectionTreeItem>(_context, DocDBCollectionTreeItem.contextValue);
    }

    setConnectedNoSqlContainer(_node);


    let queryText: string;
    const populateQueryMetrics = false;


    const connectedCollection = KeyValueStore.instance.get(noSqlQueryConnectionKey);
    if (!connectedCollection) {
        throw new Error("Unable to execute query due to missing node data. Please connect to a Cosmos DB collection node.");
    } else {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unused-vars
        const { databaseId, containerId, endpoint, masterKey, isEmulator } = connectedCollection as NoSqlQueryConnection;


        if (!databaseId || !containerId) {
            // TODO ask user for database and collection
            await vscode.window.showErrorMessage(localize("missingDatabaseName", "Database not specified"));
            return Promise.reject();
        }

        // Cache
        const server = endpoint;

        //const tokenId: number | undefined = undefined;

        const view = getViewLoader(server, databaseId, containerId, {
            extensionPath: ext.context.extensionPath,
            title: containerId,
            onReady: () => {
                view.sendCommand({
                    type: "initialize",
                    data: {
                        connectionId: server,
                        databaseName: databaseId,
                        containerName: containerId,
                        pagingType: "infinite",
                        defaultQueryText: "select * from c",
                    },
                });
            },
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            onQuerySubmit: async (query: EditorUserQuery) => {
                queryText = query.query;

                if (!connectedCollection) {
                    throw new Error("Unable to execute query due to missing node data. Please connect to a Cosmos DB collection node.");
                } else {
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                    const { databaseId, containerId, endpoint, masterKey, isEmulator } = connectedCollection as NoSqlQueryConnection;
                    const client = getCosmosClient(endpoint, masterKey, isEmulator);
                    const options = { populateQueryMetrics, maxItemCount: 1000 };
                    const response = await client.database(databaseId).container(containerId).items.query(queryText, options).fetchAll();
                    const resultDocumentTitle = `query results for ${containerId}`;
                    if (populateQueryMetrics) {
                        await vscodeUtil.showNewFile(JSON.stringify({
                            result: response.resources,
                            queryMetrics: response.queryMetrics
                        }, undefined, 2), resultDocumentTitle, ".json", vscode.ViewColumn.Beside);
                    } else {
                        await vscodeUtil.showNewFile(JSON.stringify(response.resources, undefined, 2), resultDocumentTitle, ".json", vscode.ViewColumn.Beside);
                    }
                }


                /*tokenId = await appContext.cosmosDbNoSqlService.generateCancelationToken(connectionOptions!);

                showStatusBarItem(localize("runningQuery", "Running query..."));
                console.log("submitquery", query);
                view.sendCommand({
                    type: "setProgress",
                    data: true,
                });
                try {
                    const queryResult = await appContext.cosmosDbNoSqlService.submitQuery(
                        connectionOptions!,
                        databaseName!,
                        containerName!,
                        query,
                        tokenId
                    );

                    if (queryResult.documents === undefined) {
                        vscode.window.showErrorMessage(localize("queryFailed", "Query failed"));
                        return;
                    }

                    if (query.pagingInfo.kind === "infinite" && query.pagingInfo.continuationToken) {
                        const cachedResultDocuments = appContext.getCachedQueryResultDocuments(
                            server,
                            databaseName!,
                            containerName!
                        );
                        if (cachedResultDocuments) {
                            queryResult.documents = cachedResultDocuments!.concat(queryResult.documents);
                        }
                    }
                    appContext.setCachedQueryResultDocuments(server, databaseName!, containerName!, queryResult.documents);

                    console.log("query # results:", queryResult.documents.length, queryResult.pagingInfo);
                    view.sendCommand({
                        type: "queryResult",
                        data: queryResult,
                    });
                } catch (e) {
                    vscode.window.showErrorMessage(getErrorMessage(e));
                } finally {
                    hideStatusBarItem();
                    view.sendCommand({
                        type: "setProgress",
                        data: false,
                    });
                }*/
            },
            onQueryCancel: () => {
                /*
                if (tokenId === undefined) {
                    vscode.window.showErrorMessage(localize("TokenIdNotInitialized", "Token Id is not initialized"));
                    return;
                }
                // Cancel query and set progress to undefined
                vscode.window.showInformationMessage(localize("CancelingQueryRequested", "Canceling query requested"));
                appContext.cosmosDbNoSqlService.cancelToken(connectionOptions!, tokenId);
                */
            },
            onCreateNewDocument: () => {
                /*
                const fileUri = vscode.Uri.parse(
                    `${CosmosDbNoSqlFileSystemProvider.SCHEME}:/${server}/${databaseName}/${containerName}/${CosmosDbNoSqlFileSystemProvider.NEW_DOCUMENT_FILENAME}`
                );
                cosmosDbNoSqlFileSystemProvider.writeFile(
                    fileUri,
                    Buffer.from(
                        `{
    "id": "replace_with_new_document_id"
  }`
                    ),
                    { create: true, overwrite: true }
                );
                vscode.commands.executeCommand(
                    "vscode.open",
                    fileUri,
                    vscode.ViewColumn.Beside,
                    localize("cosmosDbNewDocument", "Cosmos DB: New Document")
                );
                */
            },
            onDidDispose: () => {
                removeViewLoader(server, databaseId, containerId);
            },
        });
        view.reveal();







        /*
        const client = getCosmosClient(endpoint, masterKey, isEmulator);
        const options = { populateQueryMetrics };
        const response = await client.database(databaseId).container(containerId).items.query(queryText, options).fetchAll();
        const resultDocumentTitle = `query results for ${containerId}`;
        if (populateQueryMetrics === true) {
            await vscodeUtil.showNewFile(JSON.stringify({
                result: response.resources,
                queryMetrics: response.queryMetrics
            }, undefined, 2), resultDocumentTitle, ".json", ViewColumn.Beside);
        } else {
            await vscodeUtil.showNewFile(JSON.stringify(response.resources, undefined, 2), resultDocumentTitle, ".json", ViewColumn.Beside);
        }
        */
    }



}
