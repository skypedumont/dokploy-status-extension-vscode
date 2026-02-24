import * as vscode from 'vscode';

export interface DokployProject {
    projectId: string;
    name: string;
    description?: string;
    environments?: DokployEnvironment[];
    // Flattened applications from all environments (populated after parsing)
    applications?: DokployApplication[];
}

export interface DokployEnvironment {
    environmentId: string;
    name: string;
    applications?: DokployApplication[];
}

export interface DokployApplication {
    applicationId: string;
    name: string;
    applicationStatus: 'done' | 'error' | 'running' | 'idle' | string;
    environmentId?: string;
}

export class DokployApi {
    private apiUrl: string;
    private apiKey: string;

    constructor() {
        const config = vscode.workspace.getConfiguration('dokployStatus');
        this.apiUrl = (config.get<string>('apiUrl') || '').replace(/\/+$/, ''); // trim trailing slashes
        this.apiKey = config.get<string>('apiKey') || '';
    }

    private async request<T>(endpoint: string): Promise<T> {
        if (!this.apiUrl) {
            throw new Error('API URL is missing. Set it in Settings → dokployStatus.apiUrl');
        }
        if (!this.apiKey) {
            throw new Error('API Key is missing. Set it in Settings → dokployStatus.apiKey');
        }

        const url = `${this.apiUrl}/api${endpoint}`;
        console.log(`[DokPloy] Requesting: ${url}`);

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'x-api-key': this.apiKey,
                'Content-Type': 'application/json'
            }
        });

        const data = await response.text();

        if (response.ok) {
            try {
                return JSON.parse(data) as T;
            } catch (e) {
                throw new Error('Failed to parse JSON response');
            }
        } else if (response.status === 401 || response.status === 403) {
            throw new Error(`Unauthorized (${response.status}): Check your API Key`);
        } else {
            throw new Error(`API error ${response.status}: ${data}`);
        }
    }

    public async getAllProjects(): Promise<DokployProject[]> {
        const rawData: any = await this.request('/project.all');

        let projects: any[] = [];

        // The API returns an array of projects directly
        if (Array.isArray(rawData)) {
            projects = rawData;
        } else if (rawData && rawData.projects) {
            projects = rawData.projects;
        } else {
            projects = [rawData];
        }

        // Flatten applications from environments into the project level
        for (const project of projects) {
            const allApps: DokployApplication[] = [];
            if (project.environments && Array.isArray(project.environments)) {
                for (const env of project.environments) {
                    if (env.applications && Array.isArray(env.applications)) {
                        // Tag each app with its environmentId for dashboard URL
                        for (const app of env.applications) {
                            app.environmentId = env.environmentId;
                        }
                        allApps.push(...env.applications);
                    }
                }
            }
            // Also include direct applications if they exist (for compatibility)
            if (project.applications && Array.isArray(project.applications)) {
                allApps.push(...project.applications);
            }
            project.applications = allApps;
        }

        console.log(`[DokPloy] Parsed ${projects.length} projects with ${projects.reduce((sum: number, p: any) => sum + (p.applications?.length || 0), 0)} total applications.`);
        return projects;
    }

    private async post<T>(endpoint: string, body: Record<string, any>): Promise<T> {
        if (!this.apiUrl) {
            throw new Error('API URL is missing. Set it in Settings → dokployStatus.apiUrl');
        }
        if (!this.apiKey) {
            throw new Error('API Key is missing. Set it in Settings → dokployStatus.apiKey');
        }

        const url = `${this.apiUrl}/api${endpoint}`;
        console.log(`[DokPloy] POST: ${url}`);

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'x-api-key': this.apiKey,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });

        const data = await response.text();

        if (response.ok) {
            try {
                return JSON.parse(data) as T;
            } catch {
                return {} as T; // Some endpoints return empty body on success
            }
        } else if (response.status === 401 || response.status === 403) {
            throw new Error(`Unauthorized (${response.status}): Check your API Key`);
        } else {
            throw new Error(`API error ${response.status}: ${data}`);
        }
    }

    public async redeployApplication(applicationId: string): Promise<void> {
        await this.post('/application.redeploy', { applicationId });
    }
}
