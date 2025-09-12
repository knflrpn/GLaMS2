// GLaMS Roulette Segment Builder Page
import { ConnectionManager, log } from './glams-roulette-common.js';

// =======================
// SEGMENT BUILDER CLASS
// =======================
class SegmentBuilder {
	constructor() {
		this.connectionManager = new ConnectionManager({
			onConnect: (info) => this.updateConnectionStatus(true, info),
			onDisconnect: (reason) => this.updateConnectionStatus(false, reason),
			onError: (error) => this.updateConnectionStatus(false, error)
		});

		this.manipulators = [];
		this.currentSegmentActions = [];
		this.committedSegments = [];

		// Get DOM elements
		this.elements = {
			roomName: document.getElementById('roomName'),
			connectBtn: document.getElementById('connectBtn'),
			refreshBtn: document.getElementById('refreshBtn'),
			disconnectBtn: document.getElementById('disconnectBtn'),
			connectionStatus: document.getElementById('connectionStatus'),
			connectionText: document.getElementById('connectionText'),
			manipulatorsList: document.getElementById('manipulatorsList'),
			segmentName: document.getElementById('segmentName'),
			currentSegmentActions: document.getElementById('currentSegmentActions'),
			commitSegmentBtn: document.getElementById('commitSegmentBtn'),
			clearSegmentBtn: document.getElementById('clearSegmentBtn'),
			segmentsList: document.getElementById('segmentsList'),
			clearAllBtn: document.getElementById('clearAllBtn'),
			exportData: document.getElementById('exportData'),
			copyExportBtn: document.getElementById('copyExportBtn'),
			messageLog: document.getElementById('messageLog')
		};

		this.initialize();
	}

	initialize() {
		// Set up event listeners
		this.elements.connectBtn?.addEventListener('click', () => this.connect());
		this.elements.refreshBtn?.addEventListener('click', () => this.refreshManipulators());
		this.elements.disconnectBtn?.addEventListener('click', () => this.disconnect());
		this.elements.commitSegmentBtn?.addEventListener('click', () => this.commitSegment());
		this.elements.clearSegmentBtn?.addEventListener('click', () => this.clearCurrentSegment());
		this.elements.clearAllBtn?.addEventListener('click', () => this.clearAllSegments());
		this.elements.copyExportBtn?.addEventListener('click', () => this.copyExportData());

		// Enter key handlers
		this.elements.roomName?.addEventListener('keypress', (e) => {
			if (e.key === 'Enter' && !this.elements.connectBtn.disabled) {
				this.connect();
			}
		});

		this.elements.segmentName?.addEventListener('keypress', (e) => {
			if (e.key === 'Enter' && !this.elements.commitSegmentBtn.disabled) {
				this.commitSegment();
			}
		});

		// Initialize UI
		this.updateConnectionStatus(false);
		this.updateCurrentSegment();
		this.updateCommittedSegments();

		this.log('GLaMS Roulette Segment Builder ready');
	}

	log(message, type = 'info') {
		log(message, type, this.elements.messageLog);
	}

	updateConnectionStatus(connected, info = '') {
		if (this.elements.connectionStatus) {
			this.elements.connectionStatus.classList.toggle('connected', connected);
		}

		if (this.elements.connectionText) {
			this.elements.connectionText.className = connected ?
				'connection-status connected' : 'connection-status disconnected';
			this.elements.connectionText.textContent = connected ?
				`Connected to ${this.connectionManager.currentRoom || 'room'}` : 'Disconnected';
		}

		if (this.elements.connectBtn) this.elements.connectBtn.disabled = connected;
		if (this.elements.refreshBtn) this.elements.refreshBtn.disabled = !connected;
		if (this.elements.disconnectBtn) this.elements.disconnectBtn.disabled = !connected;
	}

	updateCurrentSegment() {
		const container = this.elements.currentSegmentActions;
		if (!container) return;

		if (this.currentSegmentActions.length === 0) {
			container.innerHTML = '<div style="text-align: center; padding: 10px; color: #a0a0a0;">No actions added yet</div>';
			if (this.elements.commitSegmentBtn) this.elements.commitSegmentBtn.disabled = true;
		} else {
			container.innerHTML = '';
			this.currentSegmentActions.forEach((action, index) => {
				const actionDiv = document.createElement('div');
				actionDiv.className = 'segment-action';

				const infoDiv = document.createElement('div');
				infoDiv.className = 'segment-action-info';

				const paramsText = Object.keys(action.parameters).length > 0
					? ` (${Object.entries(action.parameters).map(([k, v]) => `${k}: ${v}`).join(', ')})`
					: '';

				infoDiv.innerHTML = `
          <strong>${action.manipulatorTitle}</strong><br>
          <small>${action.actionDisplayName || action.actionName}${paramsText}</small>
        `;

				const removeBtn = document.createElement('button');
				removeBtn.className = 'segment-action-remove';
				removeBtn.textContent = 'Remove';
				removeBtn.onclick = () => this.removeActionFromSegment(index);

				actionDiv.appendChild(infoDiv);
				actionDiv.appendChild(removeBtn);
				container.appendChild(actionDiv);
			});

			if (this.elements.commitSegmentBtn) this.elements.commitSegmentBtn.disabled = false;
		}
	}

	updateCommittedSegments() {
		const container = this.elements.segmentsList;
		if (!container) return;

		if (this.committedSegments.length === 0) {
			container.innerHTML = '<div style="text-align: center; padding: 20px; color: #a0a0a0;">No segments created yet</div>';
		} else {
			container.innerHTML = '';
			this.committedSegments.forEach((segment, index) => {
				const segmentDiv = document.createElement('div');
				segmentDiv.className = 'segment-card';

				segmentDiv.innerHTML = `
          <h4>${segment.displayName}</h4>
          <div class="action-count">${segment.actions.length} action(s)</div>
          <button class="button small danger" onclick="window.segmentBuilder.removeSegment(${index})">Remove</button>
        `;

				container.appendChild(segmentDiv);
			});
		}
		this.updateExportData();
	}

	updateExportData() {
		if (!this.elements.exportData) return;

		const exportData = {
			segments: this.committedSegments,
			created: new Date().toISOString(),
			version: '1.0'
		};
		this.elements.exportData.value = JSON.stringify(exportData, null, 2);
	}

	createParameterInput(param, container) {
		const paramDiv = document.createElement('div');
		paramDiv.className = 'param-input';

		const label = document.createElement('label');
		label.textContent = `${param.name}${param.required ? ' *' : ''}`;

		const input = document.createElement('input');
		input.type = param.type === 'number' ? 'number' : 'text';
		input.placeholder = param.description || param.name;
		input.value = param.default || '';
		input.dataset.paramName = param.name;
		input.dataset.paramType = param.type || 'string';

		paramDiv.appendChild(label);
		paramDiv.appendChild(input);
		container.appendChild(paramDiv);
	}

	addActionToSegment(manipulatorId, manipulatorTitle, action, actionContainer) {
		// Gather parameters
		const params = {};
		const inputs = actionContainer.querySelectorAll('[data-param-name]');

		inputs.forEach(input => {
			const name = input.dataset.paramName;
			const type = input.dataset.paramType;
			let value = input.value;

			if (value) {
				if (type === 'number') {
					value = parseFloat(value);
				} else if (type === 'boolean') {
					value = value.toLowerCase() === 'true';
				} else if (type === 'object') {
					try {
						value = JSON.parse(value);
					} catch (e) {
						this.log(`Invalid JSON for parameter ${name}: ${e.message}`, 'error');
						return;
					}
				}
			}

			if (value !== '' && value !== null) {
				params[name] = value;
			}
		});

		const segmentAction = {
			manipulatorId,
			manipulatorTitle,
			actionName: action.name,
			actionDisplayName: action.displayName,
			parameters: params
		};

		this.currentSegmentActions.push(segmentAction);
		this.updateCurrentSegment();

		this.log(`Added "${action.displayName}" to current segment`, 'success');
	}

	removeActionFromSegment(index) {
		const action = this.currentSegmentActions[index];
		this.currentSegmentActions.splice(index, 1);
		this.updateCurrentSegment();
		this.log(`Removed "${action.actionDisplayName || action.actionName}" from current segment`);
	}

	createActionSection(manipulatorId, manipulatorTitle, action) {
		const actionDiv = document.createElement('div');
		actionDiv.className = 'action-item';

		const titleDiv = document.createElement('h5');
		titleDiv.textContent = action.displayName;
		actionDiv.appendChild(titleDiv);

		if (action.description) {
			const descDiv = document.createElement('div');
			descDiv.textContent = action.description;
			descDiv.style.color = '#a0a0a0';
			descDiv.style.fontSize = '0.8rem';
			descDiv.style.marginBottom = '8px';
			actionDiv.appendChild(descDiv);
		}

		// Create parameter inputs
		if (action.parameters && action.parameters.length > 0) {
			action.parameters.forEach(param => {
				this.createParameterInput(param, actionDiv);
			});
		}

		// Create add button
		const addBtn = document.createElement('button');
		addBtn.className = 'button small';
		addBtn.textContent = 'Add to Segment';
		addBtn.onclick = () => this.addActionToSegment(manipulatorId, manipulatorTitle, action, actionDiv);
		actionDiv.appendChild(addBtn);

		return actionDiv;
	}

	async createManipulatorCard(manipulator) {
		const manipulatorDiv = document.createElement('div');
		manipulatorDiv.className = 'manipulator-item';

		const titleDiv = document.createElement('h4');
		titleDiv.textContent = manipulator.title;
		manipulatorDiv.appendChild(titleDiv);

		if (manipulator.type) {
			const typeDiv = document.createElement('div');
			typeDiv.textContent = `Type: ${manipulator.type}`;
			typeDiv.style.color = '#a0a0a0';
			typeDiv.style.marginBottom = '10px';
			manipulatorDiv.appendChild(typeDiv);
		}

		try {
			const actions = await this.connectionManager.getManipulatorActions(manipulator.id);

			if (actions && actions.length > 0) {
				actions.forEach(action => {
					const actionSection = this.createActionSection(manipulator.id, manipulator.title, action);
					manipulatorDiv.appendChild(actionSection);
				});
			} else {
				const noActionsDiv = document.createElement('div');
				noActionsDiv.textContent = 'No actions available';
				noActionsDiv.style.color = '#718096';
				noActionsDiv.style.fontStyle = 'italic';
				manipulatorDiv.appendChild(noActionsDiv);
			}
		} catch (error) {
			this.log(`Failed to get actions for ${manipulator.title}: ${error.message}`, 'error');
			const errorDiv = document.createElement('div');
			errorDiv.textContent = 'Failed to load actions';
			errorDiv.style.color = '#ef4444';
			manipulatorDiv.appendChild(errorDiv);
		}

		return manipulatorDiv;
	}

	async refreshManipulators() {
		if (!this.connectionManager.isConnected) {
			this.log('Not connected to GLaMS system', 'error');
			return;
		}

		try {
			this.log('Loading manipulators...');
			const container = this.elements.manipulatorsList;
			if (container) {
				container.innerHTML = '<div style="text-align: center; padding: 20px; color: #a0a0a0;">Loading...</div>';
			}

			this.manipulators = await this.connectionManager.getManipulators();
			this.log(`Found ${this.manipulators.length} manipulator(s)`, 'success');

			if (container) {
				container.innerHTML = '';

				if (this.manipulators.length === 0) {
					container.innerHTML = '<div style="text-align: center; padding: 20px; color: #718096;">No manipulators found</div>';
				} else {
					for (const manipulator of this.manipulators) {
						const card = await this.createManipulatorCard(manipulator);
						container.appendChild(card);
					}
				}
			}
		} catch (error) {
			this.log(`Failed to load manipulators: ${error.message}`, 'error');
			if (this.elements.manipulatorsList) {
				this.elements.manipulatorsList.innerHTML = `<div style="text-align: center; padding: 20px; color: #ef4444;">Failed to load: ${error.message}</div>`;
			}
		}
	}

	async connect() {
		const roomName = this.elements.roomName?.value.trim();

		if (!roomName) {
			this.log('Please enter a room name', 'error');
			return;
		}

		try {
			this.log(`Connecting to room "${roomName}"...`);
			await this.connectionManager.connect(roomName, 'browser');
			this.refreshManipulators();
		} catch (error) {
			this.log(`Connection failed: ${error.message}`, 'error');
		}
	}

	disconnect() {
		this.connectionManager.disconnect();
		this.manipulators = [];
		if (this.elements.manipulatorsList) {
			this.elements.manipulatorsList.innerHTML = '<div style="text-align: center; padding: 20px; color: #a0a0a0;">Connect to GLaMS to see available manipulators</div>';
		}
		this.log('Disconnected from GLaMS', 'success');
	}

	commitSegment() {
		const segmentName = this.elements.segmentName?.value.trim();

		if (!segmentName) {
			this.log('Please enter a segment name', 'error');
			return;
		}

		if (this.currentSegmentActions.length === 0) {
			this.log('No actions in current segment', 'error');
			return;
		}

		const segment = {
			displayName: segmentName,
			actions: [...this.currentSegmentActions],
		};

		this.committedSegments.push(segment);

		// Clear current segment
		this.currentSegmentActions = [];
		if (this.elements.segmentName) this.elements.segmentName.value = '';
		this.updateCurrentSegment();
		this.updateCommittedSegments();

		this.log(`Committed segment "${segmentName}" with ${segment.actions.length} action(s)`, 'success');
	}

	clearCurrentSegment() {
		this.currentSegmentActions = [];
		if (this.elements.segmentName) this.elements.segmentName.value = '';
		this.updateCurrentSegment();
		this.log('Cleared current segment');
	}

	removeSegment(index) {
		const segment = this.committedSegments[index];
		this.committedSegments.splice(index, 1);
		this.updateCommittedSegments();
		this.log(`Removed segment "${segment.displayName}"`);
	}

	clearAllSegments() {
		if (this.committedSegments.length === 0) return;

		if (confirm('Are you sure you want to clear all segments?')) {
			this.committedSegments = [];
			this.updateCommittedSegments();
			this.log('Cleared all segments');
		}
	}

	async copyExportData() {
		if (!this.elements.exportData) return;

		try {
			await navigator.clipboard.writeText(this.elements.exportData.value);
			this.log('Export data copied to clipboard', 'success');
		} catch (error) {
			this.log('Failed to copy to clipboard', 'error');
			// Fallback: select the text
			this.elements.exportData.select();
			this.elements.exportData.setSelectionRange(0, 99999);
		}
	}
}

// =======================
// INITIALIZATION
// =======================

// Initialize when DOM is loaded
function initializeSegmentBuilder() {
	const segmentBuilder = new SegmentBuilder();
	window.segmentBuilder = segmentBuilder; // For global access from button handlers
}

if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', initializeSegmentBuilder);
} else {
	initializeSegmentBuilder();
}