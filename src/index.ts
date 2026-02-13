import {
	WorkflowEntrypoint,
	WorkflowEvent,
	WorkflowStep,
} from "cloudflare:workers";

/**
 * Cloudflare Workflow with Dashboard UI
 * Real-time updates, step visualization, and approval controls
 * Uses D1 for persistence across Worker instances
 */

type Params = {
	email?: string;
	metadata?: Record<string, string>;
};

interface StepData {
	name: string;
	status: 'pending' | 'running' | 'completed' | 'failed' | 'waiting';
	output?: any;
	error?: string;
	timestamp: number;
	duration?: number;
}

interface WorkflowInstance {
	id: string;
	status: 'running' | 'waiting' | 'completed' | 'failed' | 'queued';
	steps: StepData[];
	startTime: number;
	endTime?: number;
}

// SSE clients for real-time updates (per instance)
const sseClients: Map<string, Set<ReadableStreamDefaultController>> = new Map();

async function broadcastUpdate(instanceId: string, data: any, env: Env) {
	const clients = sseClients.get(instanceId);
	if (clients) {
		const message = `data: ${JSON.stringify(data)}\n\n`;
		clients.forEach(controller => {
			try {
				controller.enqueue(new TextEncoder().encode(message));
			} catch (e) {
				// Client disconnected
			}
		});
	}
}

async function updateStep(instanceId: string, stepIndex: number, updates: Partial<StepData>, env: Env) {
	const instance = await getWorkflowInstance(instanceId, env);
	if (instance && instance.steps[stepIndex]) {
		instance.steps[stepIndex] = { ...instance.steps[stepIndex], ...updates };
		
		// Update in database
		await env.DB.prepare(
			`UPDATE workflow_steps 
			 SET status = ?, output = ?, error = ?, duration = ?
			 WHERE workflow_id = ? AND step_index = ?`
		).bind(
			instance.steps[stepIndex].status,
			instance.steps[stepIndex].output ? JSON.stringify(instance.steps[stepIndex].output) : null,
			instance.steps[stepIndex].error || null,
			instance.steps[stepIndex].duration || null,
			instanceId,
			stepIndex
		).run();
		
		await broadcastUpdate(instanceId, { type: 'stepUpdate', instance }, env);
	}
}

async function updateWorkflowStatus(instanceId: string, status: string, env: Env, endTime?: number) {
	await env.DB.prepare(
		`UPDATE workflow_instances SET status = ?, end_time = ? WHERE id = ?`
	).bind(status, endTime || null, instanceId).run();
	
	const instance = await getWorkflowInstance(instanceId, env);
	if (instance) {
		await broadcastUpdate(instanceId, { type: 'statusUpdate', instance }, env);
	}
}

async function getWorkflowInstance(id: string, env: Env): Promise<WorkflowInstance | null> {
	const workflow = await env.DB.prepare(
		`SELECT * FROM workflow_instances WHERE id = ?`
	).bind(id).first();
	
	if (!workflow) return null;
	
	const steps = await env.DB.prepare(
		`SELECT * FROM workflow_steps WHERE workflow_id = ? ORDER BY step_index`
	).bind(id).all();
	
	return {
		id: workflow.id as string,
		status: workflow.status as WorkflowInstance['status'],
		startTime: workflow.start_time as number,
		endTime: workflow.end_time as number | undefined,
		steps: (steps.results || []).map((s: any) => ({
			name: s.name,
			status: s.status as StepData['status'],
			output: s.output ? JSON.parse(s.output) : undefined,
			error: s.error,
			timestamp: s.timestamp,
			duration: s.duration
		}))
	};
}

async function getAllWorkflowInstances(env: Env): Promise<WorkflowInstance[]> {
	const workflows = await env.DB.prepare(
		`SELECT * FROM workflow_instances ORDER BY start_time DESC`
	).all();
	
	const instances: WorkflowInstance[] = [];
	for (const workflow of workflows.results || []) {
		const steps = await env.DB.prepare(
			`SELECT * FROM workflow_steps WHERE workflow_id = ? ORDER BY step_index`
		).bind(workflow.id).all();
		
		instances.push({
			id: workflow.id as string,
			status: workflow.status as WorkflowInstance['status'],
			startTime: workflow.start_time as number,
			endTime: workflow.end_time as number | undefined,
			steps: (steps.results || []).map((s: any) => ({
				name: s.name,
				status: s.status as StepData['status'],
				output: s.output ? JSON.parse(s.output) : undefined,
				error: s.error,
				timestamp: s.timestamp,
				duration: s.duration
			}))
		});
	}
	
	return instances;
}

export class MyWorkflow extends WorkflowEntrypoint<Env, Params> {
	async run(event: WorkflowEvent<Params>, step: WorkflowStep) {
		const instanceId = (event as any).instanceId || 'unknown';
		const env = this.env;
		
		await updateWorkflowStatus(instanceId, 'running', env);

		// Step 1: Fetch files
		await updateStep(instanceId, 0, { status: 'running', timestamp: Date.now() }, env);
		const files = await step.do("my first step", async () => {
			await new Promise(resolve => setTimeout(resolve, 1000));
			return {
				inputParams: event.payload,
				files: [
					"doc_7392_rev3.pdf",
					"report_x29_final.pdf",
					"memo_2024_05_12.pdf",
					"file_089_update.pdf",
					"proj_alpha_v2.pdf",
					"data_analysis_q2.pdf",
					"notes_meeting_52.pdf",
					"summary_fy24_draft.pdf",
				],
			};
		});
		await updateStep(instanceId, 0, { 
			status: 'completed', 
			output: files,
			duration: Date.now() - (await getWorkflowInstance(instanceId, env))!.steps[0].timestamp
		}, env);

		// Step 2: Wait for approval
		await updateStep(instanceId, 1, { status: 'waiting', timestamp: Date.now() }, env);
		await updateWorkflowStatus(instanceId, 'waiting', env);
		await broadcastUpdate(instanceId, { type: 'waiting', instance: await getWorkflowInstance(instanceId, env) }, env);
		
		const waitForApproval = await step.waitForEvent("request-approval", {
			type: "approval",
			timeout: "1 hour",
		});
		
		await updateStep(instanceId, 1, { 
			status: 'completed', 
			output: { approved: true, timestamp: Date.now() },
			duration: Date.now() - (await getWorkflowInstance(instanceId, env))!.steps[1].timestamp
		}, env);
		
		await updateWorkflowStatus(instanceId, 'running', env);

		// Step 3: Fetch API data
		await updateStep(instanceId, 2, { status: 'running', timestamp: Date.now() }, env);
		const apiResponse = await step.do("some other step", async () => {
			let resp = await fetch("https://api.cloudflare.com/client/v4/ips");
			return await resp.json<any>();
		});
		await updateStep(instanceId, 2, { 
			status: 'completed', 
			output: apiResponse,
			duration: Date.now() - (await getWorkflowInstance(instanceId, env))!.steps[2].timestamp
		}, env);

		// Step 4: Sleep
		await updateStep(instanceId, 3, { status: 'running', timestamp: Date.now() }, env);
		await step.sleep("wait on something", "10 seconds");
		await updateStep(instanceId, 3, { 
			status: 'completed', 
			output: { message: "Waited 10 seconds" },
			duration: Date.now() - (await getWorkflowInstance(instanceId, env))!.steps[3].timestamp
		}, env);

		// Step 5: Write operation with potential failure
		await updateStep(instanceId, 4, { status: 'running', timestamp: Date.now() }, env);
		let retryCount = 0;
		const maxRetries = 5;
		
		try {
			await step.do(
				"make a call to write that could maybe, just might, fail",
				{
					retries: {
						limit: maxRetries,
						delay: "1 second",
						backoff: "exponential",
					},
					timeout: "15 minutes",
				},
				async () => {
					retryCount++;
					await broadcastUpdate(instanceId, { 
						type: 'retryAttempt', 
						stepIndex: 4, 
						attempt: retryCount 
					}, env);
					
					if (Math.random() > 0.7) {
						throw new Error("API call to $STORAGE_SYSTEM failed (simulated)");
					}
				}
			);
			await updateStep(instanceId, 4, { 
				status: 'completed', 
				output: { message: "Write operation successful", retries: retryCount },
				duration: Date.now() - (await getWorkflowInstance(instanceId, env))!.steps[4].timestamp
			}, env);
			
			await updateWorkflowStatus(instanceId, 'completed', env, Date.now());
			await broadcastUpdate(instanceId, { type: 'completed', instance: await getWorkflowInstance(instanceId, env) }, env);
		} catch (error: any) {
			await updateStep(instanceId, 4, { 
				status: 'failed', 
				error: error.message,
				duration: Date.now() - (await getWorkflowInstance(instanceId, env))!.steps[4].timestamp
			}, env);
			
			await updateWorkflowStatus(instanceId, 'failed', env, Date.now());
			await broadcastUpdate(instanceId, { type: 'failed', instance: await getWorkflowInstance(instanceId, env), error: error.message }, env);
			throw error;
		}
	}
}

const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Workflow Dashboard</title>
	<style>
		* {
			margin: 0;
			padding: 0;
			box-sizing: border-box;
		}
		
		body {
			font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
			background: #0f172a;
			color: #e2e8f0;
			min-height: 100vh;
		}
		
		.container {
			max-width: 1200px;
			margin: 0 auto;
			padding: 20px;
		}
		
		header {
			text-align: center;
			margin-bottom: 30px;
		}
		
		h1 {
			font-size: 2.5rem;
			background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
			-webkit-background-clip: text;
			-webkit-text-fill-color: transparent;
			margin-bottom: 10px;
		}
		
		.subtitle {
			color: #94a3b8;
			font-size: 1.1rem;
		}
		
		.btn {
			padding: 12px 24px;
			border: none;
			border-radius: 8px;
			font-size: 1rem;
			cursor: pointer;
			transition: all 0.3s ease;
			font-weight: 600;
			display: inline-flex;
			align-items: center;
			gap: 8px;
		}
		
		.btn-primary {
			background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
			color: white;
		}
		
		.btn-primary:hover {
			transform: translateY(-2px);
			box-shadow: 0 10px 20px rgba(102, 126, 234, 0.3);
		}
		
		.btn-continue {
			background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
			color: white;
		}
		
		.btn-continue:hover {
			transform: translateY(-2px);
			box-shadow: 0 10px 20px rgba(245, 158, 11, 0.3);
		}
		
		.btn-retry {
			background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
			color: white;
		}
		
		.btn-retry:hover {
			transform: translateY(-2px);
			box-shadow: 0 10px 20px rgba(239, 68, 68, 0.3);
		}
		
		.btn:disabled {
			opacity: 0.5;
			cursor: not-allowed;
			transform: none !important;
		}
		
		.main-grid {
			display: grid;
			grid-template-columns: 1fr 350px;
			gap: 30px;
			margin-bottom: 30px;
		}
		
		@media (max-width: 900px) {
			.main-grid {
				grid-template-columns: 1fr;
			}
		}
		
		.card {
			background: #1e293b;
			border-radius: 12px;
			padding: 24px;
			box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
		}
		
		.card h2 {
			font-size: 1.3rem;
			margin-bottom: 20px;
			color: #f8fafc;
			display: flex;
			align-items: center;
			gap: 10px;
		}
		
		.current-workflow {
			min-height: 400px;
		}
		
		.no-workflow {
			text-align: center;
			padding: 60px 20px;
			color: #64748b;
		}
		
		.no-workflow-icon {
			font-size: 4rem;
			margin-bottom: 20px;
			opacity: 0.5;
		}
		
		.workflow-header {
			display: flex;
			justify-content: space-between;
			align-items: center;
			margin-bottom: 20px;
			padding-bottom: 20px;
			border-bottom: 1px solid #334155;
		}
		
		.workflow-id {
			font-family: monospace;
			font-size: 0.9rem;
			color: #94a3b8;
		}
		
		.status-badge {
			padding: 6px 12px;
			border-radius: 20px;
			font-size: 0.85rem;
			font-weight: 600;
			text-transform: uppercase;
			letter-spacing: 0.5px;
		}
		
		.status-running {
			background: rgba(59, 130, 246, 0.2);
			color: #60a5fa;
		}
		
		.status-waiting {
			background: rgba(245, 158, 11, 0.2);
			color: #fbbf24;
		}
		
		.status-completed {
			background: rgba(34, 197, 94, 0.2);
			color: #4ade80;
		}
		
		.status-failed {
			background: rgba(239, 68, 68, 0.2);
			color: #f87171;
		}
		
		.status-queued {
			background: rgba(148, 163, 184, 0.2);
			color: #cbd5e1;
		}
		
		.progress-bar {
			height: 8px;
			background: #334155;
			border-radius: 4px;
			overflow: hidden;
			margin-bottom: 30px;
		}
		
		.progress-fill {
			height: 100%;
			background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
			border-radius: 4px;
			transition: width 0.5s ease;
		}
		
		.steps-container {
			display: flex;
			flex-direction: column;
			gap: 16px;
		}
		
		.step {
			background: #0f172a;
			border-radius: 8px;
			padding: 16px;
			border-left: 4px solid #334155;
			transition: all 0.3s ease;
		}
		
		.step:hover {
			background: #1e293b;
		}
		
		.step-running {
			border-left-color: #60a5fa;
			background: rgba(59, 130, 246, 0.1);
		}
		
		.step-waiting {
			border-left-color: #fbbf24;
			background: rgba(245, 158, 11, 0.1);
		}
		
		.step-completed {
			border-left-color: #4ade80;
		}
		
		.step-failed {
			border-left-color: #f87171;
			background: rgba(239, 68, 68, 0.1);
		}
		
		.step-header {
			display: flex;
			justify-content: space-between;
			align-items: center;
			margin-bottom: 8px;
		}
		
		.step-number {
			background: #334155;
			color: #94a3b8;
			width: 28px;
			height: 28px;
			border-radius: 50%;
			display: flex;
			align-items: center;
			justify-content: center;
			font-size: 0.85rem;
			font-weight: 600;
		}
		
		.step-running .step-number {
			background: #3b82f6;
			color: white;
		}
		
		.step-waiting .step-number {
			background: #f59e0b;
			color: white;
		}
		
		.step-completed .step-number {
			background: #22c55e;
			color: white;
		}
		
		.step-failed .step-number {
			background: #ef4444;
			color: white;
		}
		
		.step-title {
			font-weight: 600;
			color: #f8fafc;
			flex: 1;
			margin: 0 12px;
		}
		
		.step-status {
			font-size: 0.8rem;
			padding: 4px 8px;
			border-radius: 4px;
			background: #334155;
			color: #94a3b8;
		}
		
		.step-meta {
			font-size: 0.8rem;
			color: #64748b;
			margin-top: 4px;
			display: flex;
			gap: 16px;
		}
		
		.step-output {
			margin-top: 12px;
			padding: 12px;
			background: #0f172a;
			border-radius: 6px;
			font-family: monospace;
			font-size: 0.85rem;
			color: #94a3b8;
			overflow-x: auto;
			white-space: pre-wrap;
			word-break: break-all;
			max-height: 200px;
			overflow-y: auto;
		}
		
		.step-error {
			margin-top: 12px;
			padding: 12px;
			background: rgba(239, 68, 68, 0.1);
			border-radius: 6px;
			color: #f87171;
			font-size: 0.9rem;
		}
		
		.history-list {
			max-height: 500px;
			overflow-y: auto;
		}
		
		.history-item {
			padding: 12px;
			border-radius: 8px;
			margin-bottom: 8px;
			background: #0f172a;
			cursor: pointer;
			transition: all 0.2s ease;
			border: 1px solid transparent;
		}
		
		.history-item:hover {
			background: #1e293b;
			border-color: #334155;
		}
		
		.history-item.active {
			border-color: #667eea;
			background: rgba(102, 126, 234, 0.1);
		}
		
		.history-header {
			display: flex;
			justify-content: space-between;
			align-items: center;
			margin-bottom: 6px;
		}
		
		.history-id {
			font-family: monospace;
			font-size: 0.8rem;
			color: #64748b;
		}
		
		.history-time {
			font-size: 0.75rem;
			color: #475569;
		}
		
		.actions-bar {
			display: flex;
			gap: 12px;
			margin-top: 20px;
			padding-top: 20px;
			border-top: 1px solid #334155;
		}
		
		.spinner {
			display: inline-block;
			width: 16px;
			height: 16px;
			border: 2px solid rgba(255, 255, 255, 0.3);
			border-radius: 50%;
			border-top-color: white;
			animation: spin 0.8s linear infinite;
		}
		
		@keyframes spin {
			to { transform: rotate(360deg); }
		}
		
		.connection-status {
			position: fixed;
			top: 20px;
			right: 20px;
			padding: 8px 16px;
			border-radius: 20px;
			font-size: 0.8rem;
			font-weight: 600;
			z-index: 1000;
		}
		
		.connection-online {
			background: rgba(34, 197, 94, 0.2);
			color: #4ade80;
		}
		
		.connection-offline {
			background: rgba(239, 68, 68, 0.2);
			color: #f87171;
		}
		
		.retry-indicator {
			font-size: 0.8rem;
			color: #fbbf24;
			margin-top: 4px;
		}
	</style>
</head>
<body>
	<div id="connectionStatus" class="connection-status connection-offline">● Offline</div>
	
	<div class="container">
		<header>
			<h1>Workflow Dashboard</h1>
			<p class="subtitle">Monitor and control your workflow instances in real-time</p>
		</header>
		
		<div class="main-grid">
			<div class="card current-workflow">
				<div id="workflowContent">
					<div class="no-workflow">
						<div class="no-workflow-icon">🔄</div>
						<h3>No Active Workflow</h3>
						<p style="margin: 10px 0 20px;">Start a new workflow to see it in action</p>
						<button class="btn btn-primary" onclick="startWorkflow()">
							Start New Workflow
						</button>
					</div>
				</div>
			</div>
			
			<div class="card">
				<h2>📋 History</h2>
				<div id="historyList" class="history-list">
					<p style="color: #64748b; text-align: center; padding: 20px;">No workflow history</p>
				</div>
			</div>
		</div>
	</div>

	<script>
		let currentInstanceId = null;
		let eventSource = null;
		let workflowHistory = [];
		
		function updateConnectionStatus(connected) {
			const status = document.getElementById('connectionStatus');
			if (connected) {
				status.className = 'connection-status connection-online';
				status.textContent = '● Live';
			} else {
				status.className = 'connection-status connection-offline';
				status.textContent = '● Offline';
			}
		}
		
		async function startWorkflow() {
			try {
				const response = await fetch('/api/workflow', { method: 'POST' });
				const data = await response.json();
				currentInstanceId = data.id;
				connectToStream(data.id);
				renderWorkflow(data);
				updateHistory();
			} catch (error) {
				alert('Failed to start workflow: ' + error.message);
			}
		}
		
		async function continueWorkflow() {
			if (!currentInstanceId) return;
			try {
				await fetch(\`/api/workflow/\${currentInstanceId}/continue\`, { method: 'POST' });
			} catch (error) {
				alert('Failed to continue workflow: ' + error.message);
			}
		}
		
		async function retryWorkflow() {
			if (!currentInstanceId) return;
			try {
				await fetch(\`/api/workflow/\${currentInstanceId}/retry\`, { method: 'POST' });
			} catch (error) {
				alert('Failed to retry workflow: ' + error.message);
			}
		}
		
		function connectToStream(instanceId) {
			if (eventSource) {
				eventSource.close();
			}
			
			eventSource = new EventSource(\`/api/stream?instanceId=\${instanceId}\`);
			
			eventSource.onopen = () => {
				updateConnectionStatus(true);
			};
			
			eventSource.onerror = () => {
				updateConnectionStatus(false);
			};
			
			eventSource.onmessage = (event) => {
				try {
					const data = JSON.parse(event.data);
					if (data.instance) {
						renderWorkflow(data.instance);
						updateHistory();
					}
				} catch (e) {
					console.error('Failed to parse SSE data:', e);
				}
			};
		}
		
		function renderWorkflow(instance) {
			const container = document.getElementById('workflowContent');
			const completedSteps = instance.steps.filter(s => s.status === 'completed').length;
			const progress = (completedSteps / instance.steps.length) * 100;
			
			let html = \`
				<div class="workflow-header">
					<span class="workflow-id">ID: \${instance.id.slice(0, 8)}...</span>
					<span class="status-badge status-\${instance.status}">\${instance.status}</span>
				</div>
				
				<div class="progress-bar">
					<div class="progress-fill" style="width: \${progress}%"></div>
				</div>
				
				<div class="steps-container">
			\`;
			
			instance.steps.forEach((step, index) => {
				const hasOutput = step.output !== undefined;
				const hasError = step.error !== undefined;
				const duration = step.duration ? \`(\${(step.duration / 1000).toFixed(1)}s)\` : '';
				
				html += \`
					<div class="step step-\${step.status}">
						<div class="step-header">
							<span class="step-number">\${index + 1}</span>
							<span class="step-title">\${step.name}</span>
							<span class="step-status">\${step.status}</span>
						</div>
						<div class="step-meta">
							<span>\${new Date(step.timestamp).toLocaleTimeString()}</span>
							<span>\${duration}</span>
						</div>
				\`;
				
				if (hasOutput) {
					html += \`<div class="step-output">\${JSON.stringify(step.output, null, 2)}</div>\`;
				}
				
				if (hasError) {
					html += \`<div class="step-error">Error: \${step.error}</div>\`;
				}
				
				html += '</div>';
			});
			
			html += '</div>';
			
			// Actions bar
			html += '<div class="actions-bar">';
			
			if (instance.status === 'waiting') {
				html += \`<button class="btn btn-continue" onclick="continueWorkflow()">Continue</button>\`;
			} else if (instance.status === 'failed') {
				html += \`<button class="btn btn-retry" onclick="retryWorkflow()">Retry</button>\`;
			} else if (instance.status === 'completed') {
				html += \`<button class="btn btn-primary" onclick="startWorkflow()">Start New Workflow</button>\`;
			}
			
			html += '</div>';
			
			container.innerHTML = html;
		}
		
		async function updateHistory() {
			try {
				const response = await fetch('/api/workflows');
				workflowHistory = await response.json();
				renderHistory();
			} catch (error) {
				console.error('Failed to load history:', error);
			}
		}
		
		function renderHistory() {
			const container = document.getElementById('historyList');
			
			if (workflowHistory.length === 0) {
				container.innerHTML = '<p style="color: #64748b; text-align: center; padding: 20px;">No workflow history</p>';
				return;
			}
			
			const sorted = [...workflowHistory].sort((a, b) => b.startTime - a.startTime);
			
			container.innerHTML = sorted.map(instance => {
				const duration = instance.endTime 
					? \`\${((instance.endTime - instance.startTime) / 1000).toFixed(1)}s\`
					: 'Running...';
				const isActive = instance.id === currentInstanceId;
				
				return \`
					<div class="history-item \${isActive ? 'active' : ''}" onclick="selectWorkflow('\${instance.id}')">
						<div class="history-header">
							<span class="history-id">\${instance.id.slice(0, 12)}...</span>
							<span class="status-badge status-\${instance.status}">\${instance.status}</span>
						</div>
						<div class="history-time">
							\${new Date(instance.startTime).toLocaleString()} · \${duration}
						</div>
					</div>
				\`;
			}).join('');
		}
		
		async function selectWorkflow(id) {
			currentInstanceId = id;
			try {
				const response = await fetch(\`/api/workflow/\${id}\`);
				const instance = await response.json();
				renderWorkflow(instance);
				connectToStream(id);
				renderHistory();
			} catch (error) {
				console.error('Failed to load workflow:', error);
			}
		}
		
		// Load history on page load
		updateHistory();
	</script>
</body>
</html>`;

export default {
	async fetch(req: Request, env: Env): Promise<Response> {
		const url = new URL(req.url);
		const pathname = url.pathname;

		// Dashboard HTML
		if (pathname === '/' || pathname === '') {
			return new Response(DASHBOARD_HTML, {
				headers: { 'Content-Type': 'text/html' }
			});
		}

		// SSE endpoint for real-time updates
		if (pathname === '/api/stream') {
			const instanceId = url.searchParams.get('instanceId');
			if (!instanceId) {
				return new Response('Missing instanceId', { status: 400 });
			}

			const stream = new ReadableStream({
				start(controller) {
					if (!sseClients.has(instanceId)) {
						sseClients.set(instanceId, new Set());
					}
					sseClients.get(instanceId)!.add(controller);

					// Send initial state
					getWorkflowInstance(instanceId, env).then(instance => {
						if (instance) {
							const message = `data: ${JSON.stringify({ type: 'initial', instance })}\n\n`;
							controller.enqueue(new TextEncoder().encode(message));
						}
					});
				},
				cancel(controller) {
					const clients = sseClients.get(instanceId);
					if (clients) {
						clients.delete(controller);
					}
				}
			});

			return new Response(stream, {
				headers: {
					'Content-Type': 'text/event-stream',
					'Cache-Control': 'no-cache',
					'Connection': 'keep-alive'
				}
			});
		}

		// List all workflows
		if (pathname === '/api/workflows') {
			const workflows = await getAllWorkflowInstances(env);
			return Response.json(workflows);
		}

		// Get specific workflow
		if (pathname.startsWith('/api/workflow/') && pathname.endsWith('/continue') === false && pathname.endsWith('/retry') === false && pathname !== '/api/workflows') {
			const id = pathname.split('/')[3];
			const instance = await getWorkflowInstance(id, env);
			if (!instance) {
				return new Response('Workflow not found', { status: 404 });
			}
			return Response.json(instance);
		}

		// Create new workflow
		if (pathname === '/api/workflow' && req.method === 'POST') {
			const instance = await env.MY_WORKFLOW.create();
			
			// Create workflow record in database
			await env.DB.prepare(
				`INSERT INTO workflow_instances (id, status, start_time) VALUES (?, ?, ?)`
			).bind(instance.id, 'queued', Date.now()).run();
			
			// Create step records
			const steps = [
				{ name: 'Fetch Files', status: 'pending' },
				{ name: 'Wait for Approval', status: 'pending' },
				{ name: 'Fetch API Data', status: 'pending' },
				{ name: 'Sleep', status: 'pending' },
				{ name: 'Write Operation', status: 'pending' }
			];
			
			for (let i = 0; i < steps.length; i++) {
				await env.DB.prepare(
					`INSERT INTO workflow_steps (workflow_id, step_index, name, status, timestamp) VALUES (?, ?, ?, ?, ?)`
				).bind(instance.id, i, steps[i].name, steps[i].status, Date.now()).run();
			}
			
			const workflowInstance = await getWorkflowInstance(instance.id, env);
			
			return Response.json(workflowInstance);
		}

		// Continue workflow (send approval event)
		if (pathname.endsWith('/continue')) {
			const id = pathname.split('/')[3];
			
			try {
				// Get the workflow instance binding
				const workflowInstance = await env.MY_WORKFLOW.get(id);
				await workflowInstance.sendEvent({
					type: 'approval',
					payload: { approved: true, timestamp: Date.now() }
				});
				return Response.json({ success: true });
			} catch (error: any) {
				return new Response(error.message, { status: 500 });
			}
		}

		// Retry failed workflow
		if (pathname.endsWith('/retry')) {
			const id = pathname.split('/')[3];
			const oldInstance = await getWorkflowInstance(id, env);
			
			if (!oldInstance) {
				return new Response('Workflow not found', { status: 404 });
			}
			
			// Create new instance
			const newInstance = await env.MY_WORKFLOW.create();
			
			// Create workflow record in database
			await env.DB.prepare(
				`INSERT INTO workflow_instances (id, status, start_time) VALUES (?, ?, ?)`
			).bind(newInstance.id, 'queued', Date.now()).run();
			
			// Create step records
			const steps = [
				{ name: 'Fetch Files', status: 'pending' },
				{ name: 'Wait for Approval', status: 'pending' },
				{ name: 'Fetch API Data', status: 'pending' },
				{ name: 'Sleep', status: 'pending' },
				{ name: 'Write Operation', status: 'pending' }
			];
			
			for (let i = 0; i < steps.length; i++) {
				await env.DB.prepare(
					`INSERT INTO workflow_steps (workflow_id, step_index, name, status, timestamp) VALUES (?, ?, ?, ?, ?)`
				).bind(newInstance.id, i, steps[i].name, steps[i].status, Date.now()).run();
			}
			
			const workflowInstance = await getWorkflowInstance(newInstance.id, env);
			
			return Response.json(workflowInstance);
		}

		return new Response('Not found', { status: 404 });
	},
};
