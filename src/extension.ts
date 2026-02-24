import * as vscode from 'vscode';
import { DokployTreeDataProvider, DokployAppItem } from './treeDataProvider';
import { DokployApi } from './dokployApi';

let statusBarItem: vscode.StatusBarItem;
let refreshInterval: NodeJS.Timeout | undefined;
let treeView: vscode.TreeView<any>;

export function activate(context: vscode.ExtensionContext) {
    console.log('Dokploy Status extension is now active!');

    // Initialize Tree View with badge support
    const treeDataProvider = new DokployTreeDataProvider();
    treeView = vscode.window.createTreeView('dokploy.apps', {
        treeDataProvider,
        showCollapseAll: true
    });
    context.subscriptions.push(treeView);

    // Initialize Status Bar Item
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    statusBarItem.command = 'dokploy.apps.focus';
    statusBarItem.text = '$(sync~spin) Dokploy: Fetching...';
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);

    // Register Commands
    const refreshCommand = vscode.commands.registerCommand('dokploy.refresh', async () => {
        await treeDataProvider.refresh();
        updateStatusBar(treeDataProvider.getAggregateStatus());
        updateBadge(treeDataProvider);
    });

    const openLogCommand = vscode.commands.registerCommand('dokploy.openLog', (url: string) => {
        if (url) {
            vscode.env.openExternal(vscode.Uri.parse(url));
        } else {
            const config = vscode.workspace.getConfiguration('dokployStatus');
            const baseUrl = config.get<string>('apiUrl');
            if (baseUrl) {
                vscode.env.openExternal(vscode.Uri.parse(baseUrl));
            }
        }
    });

    const redeployCommand = vscode.commands.registerCommand('dokploy.redeploy', async (item: DokployAppItem) => {
        if (!item || !item.app) {
            return;
        }

        const confirm = await vscode.window.showWarningMessage(
            `Redeploy "${item.app.name}"?`,
            { modal: true },
            'Redeploy'
        );

        if (confirm !== 'Redeploy') {
            return;
        }

        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: `Redeploying ${item.app.name}...`,
                cancellable: false
            },
            async () => {
                try {
                    const api = new DokployApi();
                    await api.redeployApplication(item.app.applicationId);
                    vscode.window.showInformationMessage(`✅ Redeploy triggered for "${item.app.name}"`);
                    // Refresh after a short delay to show the new status
                    setTimeout(() => vscode.commands.executeCommand('dokploy.refresh'), 2000);
                } catch (error: any) {
                    vscode.window.showErrorMessage(`❌ Redeploy failed: ${error.message}`);
                }
            }
        );
    });

    context.subscriptions.push(refreshCommand, openLogCommand, redeployCommand);

    // Listen for configuration changes
    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('dokployStatus.apiUrl') || e.affectsConfiguration('dokployStatus.apiKey')) {
            vscode.commands.executeCommand('dokploy.refresh');
            setupPolling(treeDataProvider);
        }
    }));

    // Initial Fetch & Polling setup
    vscode.commands.executeCommand('dokploy.refresh');
    setupPolling(treeDataProvider);
}

function setupPolling(treeDataProvider: DokployTreeDataProvider) {
    if (refreshInterval) {
        clearInterval(refreshInterval);
    }
    // Poll every 30 seconds
    refreshInterval = setInterval(async () => {
        await treeDataProvider.refresh();
        updateStatusBar(treeDataProvider.getAggregateStatus());
        updateBadge(treeDataProvider);
    }, 30000);
}

function updateBadge(treeDataProvider: DokployTreeDataProvider) {
    const status = treeDataProvider.getAggregateStatus();
    const errorCount = treeDataProvider.getErrorCount();

    if (status === 'unauthorized') {
        treeView.badge = { value: 1, tooltip: 'Unauthorized — check your API Key' };
    } else if (errorCount > 0) {
        treeView.badge = { value: errorCount, tooltip: `${errorCount} application${errorCount > 1 ? 's' : ''} with errors` };
    } else {
        treeView.badge = undefined; // No badge = all good ✅
    }
}

function updateStatusBar(status: 'ok' | 'error' | 'fetching' | 'unauthorized') {
    if (status === 'ok') {
        statusBarItem.text = '$(pass) Dokploy: OK';
        statusBarItem.tooltip = 'All applications are deployed successfully.';
    } else if (status === 'error') {
        statusBarItem.text = '$(error) Dokploy: Error';
        statusBarItem.tooltip = 'One or more applications have issues.';
    } else if (status === 'unauthorized') {
        statusBarItem.text = '$(warning) Dokploy: Unauthorized';
        statusBarItem.tooltip = 'Check your API Key in settings.';
    } else {
        statusBarItem.text = '$(sync~spin) Dokploy: Fetching...';
        statusBarItem.tooltip = 'Fetching status from Dokploy...';
    }
}

export function deactivate() {
    if (refreshInterval) {
        clearInterval(refreshInterval);
    }
}
