-- Workflow instances table
CREATE TABLE IF NOT EXISTS workflow_instances (
	id TEXT PRIMARY KEY,
	status TEXT NOT NULL,
	start_time INTEGER NOT NULL,
	end_time INTEGER,
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Workflow steps table
CREATE TABLE IF NOT EXISTS workflow_steps (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	workflow_id TEXT NOT NULL,
	step_index INTEGER NOT NULL,
	name TEXT NOT NULL,
	status TEXT NOT NULL,
	output TEXT,
	error TEXT,
	timestamp INTEGER NOT NULL,
	duration INTEGER,
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (workflow_id) REFERENCES workflow_instances(id) ON DELETE CASCADE
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_workflow_steps_workflow_id ON workflow_steps(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_instances_status ON workflow_instances(status);
