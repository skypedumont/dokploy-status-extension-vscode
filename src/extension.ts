import * as vscode from 'vscode';
import { DokployTreeDataProvider } from './treeDataProvider';

let statusBarItem: vscode.StatusBarItem;
let refreshInterval: NodeJS.Timeout | undefined;

export function activate(context: vscode.ExtensionContext) {
    console.log('DokPloy Status extension is now active!');

    // Initialize Tree View Data Provider
    const treeDataProvider = new DokployTreeDataProvider();
    vscode.window.registerTreeDataProvider('dokploy.apps', treeDataProvider);

    // Initialize Status Bar Item
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    statusBarItem.command = 'dokploy.apps.focus'; // Focus the tree view when clicked
    statusBarItem.text = '$(sync~spin) DokPloy: Fetching...';
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);

    // Register Commands
    const refreshCommand = vscode.commands.registerCommand('dokploy.refresh', async () => {
        await treeDataProvider.refresh();
        updateStatusBar(treeDataProvider.getAggregateStatus());
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

    context.subscriptions.push(refreshCommand, openLogCommand);

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
    }, 30000);
}

function updateStatusBar(status: 'ok' | 'error' | 'fetching' | 'unauthorized') {
    if (status === 'ok') {
        statusBarItem.text = '$(pass) DokPloy: OK';
        statusBarItem.tooltip = 'All applications are deployed successfully.';
    } else if (status === 'error') {
        statusBarItem.text = '$(error) DokPloy: Error';
        statusBarItem.tooltip = 'One or more applications have issues.';
    } else if (status === 'unauthorized') {
        statusBarItem.text = '$(warning) DokPloy: Unauthorized';
        statusBarItem.tooltip = 'Check your API Key in settings.';
    } else {
        statusBarItem.text = '$(sync~spin) DokPloy: Fetching...';
        statusBarItem.tooltip = 'Fetching status from DokPloy...';
    }
}

export function deactivate() {
    if (refreshInterval) {
        clearInterval(refreshInterval);
    }
}
