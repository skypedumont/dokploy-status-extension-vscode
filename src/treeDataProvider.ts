import * as vscode from 'vscode';
import { DokployApi, DokployProject, DokployApplication } from './dokployApi';

export class DokployTreeDataProvider implements vscode.TreeDataProvider<DokployTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<DokployTreeItem | undefined | void> = new vscode.EventEmitter<DokployTreeItem | undefined | void>();
    readonly onDidChangeTreeData: vscode.Event<DokployTreeItem | undefined | void> = this._onDidChangeTreeData.event;

    private aggregateStatus: 'ok' | 'error' | 'fetching' | 'unauthorized' = 'fetching';
    private projects: DokployProject[] = [];
    private _error: string | null = null;

    constructor() { }

    /**
     * Fetches fresh data from the API, updates aggregate status,
     * then fires the tree-change event so VS Code re-renders the tree.
     */
    async refresh(): Promise<void> {
        this.aggregateStatus = 'fetching';
        this._error = null;

        try {
            const api = new DokployApi();
            const fetchedProjects = await api.getAllProjects();
            this.projects = fetchedProjects || [];

            // Determine aggregate status
            this.aggregateStatus = 'ok';
            for (const p of this.projects) {
                const hasErrorApp = p.applications?.some(app => app.applicationStatus === 'error');
                if (hasErrorApp) {
                    this.aggregateStatus = 'error';
                    break;
                }
            }
        } catch (error: any) {
            this._error = error.message;
            if (error.message.includes('Unauthorized')) {
                this.aggregateStatus = 'unauthorized';
            } else {
                this.aggregateStatus = 'error';
            }
        }

        // Fire tree refresh — getChildren will use cached this.projects
        this._onDidChangeTreeData.fire();
    }

    getAggregateStatus() {
        return this.aggregateStatus;
    }

    getTreeItem(element: DokployTreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: DokployTreeItem): Promise<DokployTreeItem[]> {
        if (!element) {
            // Root level: show projects (using cached data from refresh)
            if (this._error) {
                if (this._error.includes('Unauthorized')) {
                    vscode.window.showErrorMessage('DokPloy: Invalid API Key. Check Settings → dokployStatus.apiKey');
                } else {
                    vscode.window.showErrorMessage(`DokPloy: ${this._error}`);
                }
                return [new DokployTreeItem(`Error: ${this._error}`, vscode.TreeItemCollapsibleState.None)];
            }

            if (this.projects.length === 0) {
                return [new DokployTreeItem('No projects found', vscode.TreeItemCollapsibleState.None)];
            }

            return this.projects.map(p => new DokployProjectItem(p));
        } else if (element instanceof DokployProjectItem) {
            // Children of a project: Applications
            const apps = element.project.applications || [];
            if (apps.length === 0) {
                return [new DokployTreeItem('No applications', vscode.TreeItemCollapsibleState.None)];
            }
            return apps.map(app => new DokployAppItem(app, element.project.projectId));
        }

        return [];
    }
}

export class DokployTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly command?: vscode.Command
    ) {
        super(label, collapsibleState);
    }
}

export class DokployProjectItem extends DokployTreeItem {
    constructor(public readonly project: DokployProject) {
        super(project.name, vscode.TreeItemCollapsibleState.Expanded);
        this.tooltip = `Project: ${this.label}`;
        this.description = `${project.applications?.length || 0} apps`;
        this.iconPath = new vscode.ThemeIcon('folder');
    }
}

export class DokployAppItem extends DokployTreeItem {
    constructor(
        public readonly app: DokployApplication,
        public readonly projectId: string
    ) {
        const config = vscode.workspace.getConfiguration('dokployStatus');
        const baseUrl = (config.get<string>('apiUrl') || '').replace(/\/+$/, '');
        const dashboardUrl = `${baseUrl}/dashboard/project/${projectId}`;

        super(app.name, vscode.TreeItemCollapsibleState.None, {
            command: 'dokploy.openLog',
            title: 'Open in DokPloy',
            arguments: [dashboardUrl]
        });

        const isError = app.applicationStatus === 'error';
        const isRunning = app.applicationStatus === 'running';
        const isDone = app.applicationStatus === 'done';

        this.tooltip = `Status: ${app.applicationStatus}`;
        this.description = app.applicationStatus;

        if (isError) {
            this.iconPath = new vscode.ThemeIcon('error', new vscode.ThemeColor('testing.iconFailed'));
        } else if (isRunning) {
            this.iconPath = new vscode.ThemeIcon('sync~spin', new vscode.ThemeColor('testing.iconQueued'));
            this.description = 'Deploying...';
        } else if (isDone) {
            this.iconPath = new vscode.ThemeIcon('pass', new vscode.ThemeColor('testing.iconPassed'));
        } else {
            this.iconPath = new vscode.ThemeIcon('circle-outline');
            this.description = app.applicationStatus || 'idle';
        }
    }
}
