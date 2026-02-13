import {
	WorkflowEntrypoint,
	WorkflowEvent,
	WorkflowStep,
} from "cloudflare:workers";

/**
 * Cloudflare Workflow with Dashboard UI
 * Real-time updates, step visualization, and approval controls
 * Uses D1 for persistence across Worker instances
 * Includes AI analysis using Workers AI
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

// Document content embedded for workflow access
const DOCUMENT_CONTENT = `# Enhancing Productivity with Cloudflare Workflows and AI Agents

## The Evolution of Modern Development Workflows

In today's fast-paced development landscape, efficiency and automation are paramount. Cloudflare has emerged as a leading platform for building and deploying modern applications at the edge. By leveraging Cloudflare Workers, developers can execute code closer to users, reducing latency and improving performance. The platform's serverless architecture eliminates the need for traditional infrastructure management, allowing teams to focus on building features rather than maintaining servers. This shift represents a fundamental change in how we approach application development, moving from monolithic architectures to distributed, edge-first systems.

## Understanding Cloudflare Workflows for Durable Execution

Cloudflare Workflows introduces a powerful paradigm for building durable, multi-step processes that can run for extended periods. Unlike traditional serverless functions that execute and terminate quickly, workflows maintain state across steps, handle failures gracefully with automatic retries, and can pause execution to wait for external events or human approval. This makes them ideal for complex business processes such as document processing pipelines, approval workflows, data ETL operations, and long-running computational tasks. The workflow engine ensures that each step is executed exactly once, even in the face of failures, providing reliability that's essential for production systems.

## The Rise of Agentic AI Systems

Agentic AI represents the next evolution in artificial intelligence, where AI systems can autonomously make decisions, execute tasks, and interact with external systems. These agents go beyond simple chatbots by maintaining state, scheduling tasks, and integrating with APIs and databases. Cloudflare's Agents SDK provides the infrastructure to build these intelligent systems on the edge, combining the durability of Durable Objects with AI capabilities. Agents can handle long-running conversations, process documents, make approval decisions, and even coordinate complex multi-step operations while maintaining context and state across interactions.

## Combining Workflows and Agents for Maximum Productivity

The true power emerges when combining Cloudflare Workflows with AI Agents. Workflows provide the durable execution backbone, ensuring that multi-step processes complete reliably, while Agents add intelligent decision-making capabilities. For example, a document processing workflow might use an AI agent to analyze content, extract key information, and make routing decisions based on the document type. The workflow handles the orchestration, retries, and state management, while the agent provides the cognitive layer. This combination enables businesses to automate complex processes that previously required human intervention, significantly increasing productivity while maintaining accuracy and reliability.

## Practical Implementation and Best Practices

Implementing these technologies requires careful consideration of state management, error handling, and scalability. When building workflows, it's important to design idempotent steps that can be safely retried. For AI agents, consider the context window limitations of models and implement strategies for managing long-running conversations. Use Cloudflare's D1 database for persistent storage, Vectorize for semantic search capabilities, and AI Gateway for routing requests across different AI providers. By following these patterns, developers can build robust, scalable systems that leverage the best of both workflows and agentic AI, creating applications that are not only performant but also intelligent and adaptive to changing requirements.`;

export class MyWorkflow extends WorkflowEntrypoint<Env, Params> {
	async run(event: WorkflowEvent<Params>, step: WorkflowStep) {
		const instanceId = (event as any).instanceId || 'unknown';
		const env = this.env;
		
		await updateWorkflowStatus(instanceId, 'running', env);

		// Step 1: Fetch document
		await updateStep(instanceId, 0, { status: 'running', timestamp: Date.now() }, env);
		const documentContent = await step.do("fetch document", async () => {
			// Document is embedded in the code for reliable access
			const content = DOCUMENT_CONTENT;
			return {
				filename: 'document.txt',
				content: content,
				length: content.length,
				wordCount: content.split(/\s+/).length
			};
		});
		await updateStep(instanceId, 0, { 
			status: 'completed', 
			output: documentContent,
			duration: Date.now() - (await getWorkflowInstance(instanceId, env))!.steps[0].timestamp
		}, env);

		// Step 2: AI Analysis - Analyze document content
		await updateStep(instanceId, 1, { status: 'running', timestamp: Date.now() }, env);
		const aiAnalysis = await step.do("analyze with AI", async () => {
			const prompt = `Please analyze the following document and provide a comprehensive summary highlighting:
1. Main topics covered
2. Key insights about Cloudflare, Workflows, and AI Agents
3. Practical applications mentioned
4. Best practices discussed

Document:
${documentContent.content}

Provide your analysis in a structured format.`;

			const response = await env.AI.run(
				'@cf/meta/llama-3.1-8b-instruct',
				{
					prompt: prompt,
					max_tokens: 2048
				}
			);
			
			return {
				model: '@cf/meta/llama-3.1-8b-instruct',
				summary: response.response,
				wordCount: documentContent.wordCount,
				analyzedAt: new Date().toISOString()
			};
		});
		await updateStep(instanceId, 1, { 
			status: 'completed', 
			output: aiAnalysis,
			duration: Date.now() - (await getWorkflowInstance(instanceId, env))!.steps[1].timestamp
		}, env);

		// Step 3: Wait for approval
		await updateStep(instanceId, 2, { status: 'waiting', timestamp: Date.now() }, env);
		await updateWorkflowStatus(instanceId, 'waiting', env);
		await broadcastUpdate(instanceId, { type: 'waiting', instance: await getWorkflowInstance(instanceId, env) }, env);
		
		const waitForApproval = await step.waitForEvent("request-approval", {
			type: "approval",
			timeout: "1 hour",
		});
		
		await updateStep(instanceId, 2, { 
			status: 'completed', 
			output: { approved: true, timestamp: Date.now() },
			duration: Date.now() - (await getWorkflowInstance(instanceId, env))!.steps[2].timestamp
		}, env);
		
		await updateWorkflowStatus(instanceId, 'running', env);

		// Step 4: Fetch API data
		await updateStep(instanceId, 3, { status: 'running', timestamp: Date.now() }, env);
		const apiResponse = await step.do("fetch cloudflare IPs", async () => {
			let resp = await fetch("https://api.cloudflare.com/client/v4/ips");
			return await resp.json<any>();
		});
		await updateStep(instanceId, 3, { 
			status: 'completed', 
			output: apiResponse,
			duration: Date.now() - (await getWorkflowInstance(instanceId, env))!.steps[3].timestamp
		}, env);

		// Step 5: Sleep
		await updateStep(instanceId, 4, { status: 'running', timestamp: Date.now() }, env);
		await step.sleep("wait on something", "10 seconds");
		await updateStep(instanceId, 4, { 
			status: 'completed', 
			output: { message: "Waited 10 seconds" },
			duration: Date.now() - (await getWorkflowInstance(instanceId, env))!.steps[4].timestamp
		}, env);

		// Step 6: Write operation with potential failure
		await updateStep(instanceId, 5, { status: 'running', timestamp: Date.now() }, env);
		let retryCount = 0;
		const maxRetries = 5;
		
		try {
			await step.do(
				"persist results",
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
						stepIndex: 5, 
						attempt: retryCount 
					}, env);
					
					if (Math.random() > 0.7) {
						throw new Error("API call to $STORAGE_SYSTEM failed (simulated)");
					}
				}
			);
			await updateStep(instanceId, 5, { 
				status: 'completed', 
				output: { message: "Results persisted successfully", retries: retryCount },
				duration: Date.now() - (await getWorkflowInstance(instanceId, env))!.steps[5].timestamp
			}, env);
			
			await updateWorkflowStatus(instanceId, 'completed', env, Date.now());
			await broadcastUpdate(instanceId, { type: 'completed', instance: await getWorkflowInstance(instanceId, env) }, env);
		} catch (error: any) {
			await updateStep(instanceId, 5, { 
				status: 'failed', 
				error: error.message,
				duration: Date.now() - (await getWorkflowInstance(instanceId, env))!.steps[5].timestamp
			}, env);
			
			await updateWorkflowStatus(instanceId, 'failed', env, Date.now());
			await broadcastUpdate(instanceId, { type: 'failed', instance: await getWorkflowInstance(instanceId, env), error: error.message }, env);
			throw error;
		}
	}
}

export default {
	async fetch(req: Request, env: Env): Promise<Response> {
		const url = new URL(req.url);
		const pathname = url.pathname;

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
		if (pathname.startsWith('/api/workflow/') && !pathname.endsWith('/continue') && !pathname.endsWith('/retry')) {
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
			
			// Create step records - now 6 steps including AI analysis
			const steps = [
				{ name: 'Fetch Document', status: 'pending' },
				{ name: 'AI Analysis', status: 'pending' },
				{ name: 'Wait for Approval', status: 'pending' },
				{ name: 'Fetch API Data', status: 'pending' },
				{ name: 'Sleep', status: 'pending' },
				{ name: 'Persist Results', status: 'pending' }
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
			
			// Create step records - now 6 steps including AI analysis
			const steps = [
				{ name: 'Fetch Document', status: 'pending' },
				{ name: 'AI Analysis', status: 'pending' },
				{ name: 'Wait for Approval', status: 'pending' },
				{ name: 'Fetch API Data', status: 'pending' },
				{ name: 'Sleep', status: 'pending' },
				{ name: 'Persist Results', status: 'pending' }
			];
			
			for (let i = 0; i < steps.length; i++) {
				await env.DB.prepare(
					`INSERT INTO workflow_steps (workflow_id, step_index, name, status, timestamp) VALUES (?, ?, ?, ?, ?)`
				).bind(newInstance.id, i, steps[i].name, steps[i].status, Date.now()).run();
			}
			
			const workflowInstance = await getWorkflowInstance(newInstance.id, env);
			
			return Response.json(workflowInstance);
		}

		// Serve static assets (HTML, CSS, JS)
		// This will serve public/index.html for root path
		return env.ASSETS.fetch(req);
	},
};
