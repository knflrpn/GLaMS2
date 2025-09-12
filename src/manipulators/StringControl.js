/**
 * ./src/manipulators/StringControl.js
 *
 * Manipulator that allows users to create custom string associations with chat commands.
 * Users can type strings and either create new associations or execute existing ones.
 */
import { BaseManipulator } from './BaseManipulator.js';

// Initialize global configuration store if it doesn't exist
if (!window.chatConfigs) {
	window.chatConfigs = {
		configs: new Map(),
		listeners: new Set(),

		saveConfig(name, config) {
			this.configs.set(name, config);
			localStorage.setItem(`chatConfig_${name}`, JSON.stringify(config));
			this.notifyListeners(name, config);
		},

		loadConfig(name) {
			if (this.configs.has(name)) {
				return this.configs.get(name);
			}
			const saved = localStorage.getItem(`chatConfig_${name}`);
			return saved ? JSON.parse(saved) : null;
		},

		deleteConfig(name) {
			this.configs.delete(name);
			localStorage.removeItem(`chatConfig_${name}`);
			this.notifyListeners(name, null);
		},

		listConfigs() {
			return Array.from(this.configs.keys());
		},

		addListener(callback) {
			this.listeners.add(callback);
		},

		removeListener(callback) {
			this.listeners.delete(callback);
		},

		notifyListeners(name, config) {
			this.listeners.forEach(callback => callback(name, config));
		}
	};
}

/**
 * @typedef {Object} StringControlParams
 * @property {boolean} [enabled=true] - Whether this manipulator is active
 * @property {Object<string, string>} [stringMappings={}] - String to command mappings
 * @property {string} [selectedCommand=''] - Currently selected command for new associations
 * @property {number} [maxDuration=2000] - Maximum duration for command execution
 */

export class StringControl extends BaseManipulator {
	static get defaultConfig() {
		return {
			stringMappings: {},
			selectedCommand: '',
			maxDuration: 2000
		};
	}

	static get displayName() {
		return "String Control";
	}

	static get description() {
		return "Create custom string associations with chat commands and execute them.";
	}

	/**
	 * @param {StringControlParams} params - Configuration parameters
	 */
	constructor(params = {}) {
		super(params);

		this.stringMappings = new Map();
		this.selectedCommand = params.selectedCommand || '';
		this.maxDuration = params.maxDuration || 2000;

		// Load string mappings from params
		if (params.stringMappings) {
			Object.entries(params.stringMappings).forEach(([string, command]) => {
				this.stringMappings.set(string, command);
			});
		}

		// Available chat commands loaded from localStorage
		this.availableCommands = [];
		this.commandConfigs = new Map();

		// Current command execution state
		this.currentCommandStates = [];
		this.currentCommandIndex = 0;
		this.frameCounter = 0;
		this.executingString = null;

		// UI elements
		this._stringInput = null;
		this._commandSelect = null;
		this._mappingsContainer = null;
		this._statusDisplay = null;
		this._maxDurationInput = null;

		// Load chat commands from localStorage
		this._loadChatCommands();

		// Select random command if none selected
		if (!this.selectedCommand && this.availableCommands.length > 0) {
			this._selectRandomUnassociatedCommand();
		}

		// Register string-specific actions
		this._registerStringActions();
	}

	/**
	 * Load available chat commands from the global chatConfigs system
	 */
	_loadChatCommands() {
		this.availableCommands = [];
		this.commandConfigs.clear();

		// Check if global chatConfigs is available
		if (!window.chatConfigs) {
			this.log('Global chatConfigs not available');
			return;
		}

		// Load each configuration
		try {
			const configData = window.chatConfigs.loadConfig('default');
			if (configData && configData.commands) {
				configData.commands.forEach((command, index) => {
					if (command.keywords && command.keywords.length > 0) {
						// Use first keyword as the command identifier
						const commandId = command.keywords[0];
						this.availableCommands.push(commandId);
						this.commandConfigs.set(commandId, command);
					}
				});
			}
		} catch (error) {
			this.log(`Error loading config ${configName}: ${error.message}`);
		}

		this.log(`Loaded ${this.availableCommands.length} chat commands`);
	}

	/**
	 * Get commands that are not yet associated with strings
	 */
	_getUnassociatedCommands() {
		const associatedCommands = new Set(this.stringMappings.values());
		return this.availableCommands.filter(cmd => !associatedCommands.has(cmd));
	}

	/**
	 * Select a random unassociated command
	 */
	_selectRandomUnassociatedCommand() {
		const unassociated = this._getUnassociatedCommands();
		if (unassociated.length > 0) {
			const randomIndex = Math.floor(Math.random() * unassociated.length);
			this.selectedCommand = unassociated[randomIndex];

			if (this._commandSelect) {
				this._commandSelect.value = this.selectedCommand;
			}

			this.log(`Selected random command: ${this.selectedCommand}`);
		} else {
			this.selectedCommand = '';
			if (this._commandSelect) {
				this._commandSelect.value = '';
			}
		}
	}

	/**
	 * Register actions specific to the StringControl manipulator
	 */
	_registerStringActions() {
		this.registerAction({
			name: 'executeString',
			displayName: 'Execute String',
			description: 'Execute a string (create association or run command)',
			parameters: [
				{
					name: 'string',
					type: 'string',
					description: 'String to execute',
					required: true
				}
			],
			handler: (params) => this.executeString(params.string)
		});

		this.registerAction({
			name: 'createAssociation',
			displayName: 'Create Association',
			description: 'Create a new string-to-command association',
			parameters: [
				{
					name: 'string',
					type: 'string',
					description: 'String to associate',
					required: true
				},
				{
					name: 'command',
					type: 'string',
					description: 'Command ID to associate with',
					required: true
				}
			],
			handler: (params) => this.createAssociation(params.string, params.command)
		});

		this.registerAction({
			name: 'removeAssociation',
			displayName: 'Remove Association',
			description: 'Remove a string-to-command association',
			parameters: [
				{
					name: 'string',
					type: 'string',
					description: 'String to remove association for',
					required: true
				}
			],
			handler: (params) => this.removeAssociation(params.string)
		});

		this.registerAction({
			name: 'clearAllAssociations',
			displayName: 'Clear All Associations',
			description: 'Remove all string associations',
			handler: () => this.clearAllAssociations()
		});

		this.registerAction({
			name: 'reloadCommands',
			displayName: 'Reload Commands',
			description: 'Reload chat commands from localStorage',
			handler: () => this.reloadCommands()
		});

		this.registerAction({
			name: 'setSelectedCommand',
			displayName: 'Set Selected Command',
			description: 'Set the currently selected command for new associations',
			parameters: [
				{
					name: 'command',
					type: 'string',
					description: 'Command ID to select',
					required: true
				}
			],
			handler: (params) => this.setSelectedCommand(params.command)
		});

		this.registerAction({
			name: 'setMaxDuration',
			displayName: 'Set Max Duration',
			description: 'Set maximum duration for command execution',
			parameters: [
				{
					name: 'duration',
					type: 'number',
					description: 'Duration in milliseconds (50-5000)',
					required: true,
					default: 2000
				}
			],
			handler: (params) => this.setMaxDuration(params.duration)
		});
	}

	/**
	 * Execute a string - either run associated command or create new association
	 * @param {string} string - String to execute
	 */
	executeString(string) {
		if (!string || !string.trim()) {
			this.log('Empty string provided');
			return false;
		}

		const trimmedString = string.trim();

		if (this.stringMappings.has(trimmedString)) {
			// Execute existing association
			const commandId = this.stringMappings.get(trimmedString);
			return this._executeCommand(commandId, trimmedString);
		} else {
			// Create new association if we have a selected command
			if (this.selectedCommand) {
				return this.createAssociation(trimmedString, this.selectedCommand);
			} else {
				this.log('No command selected for new association');
				this._updateStatusDisplay('No command selected for new association');
				return false;
			}
		}
	}

	/**
	 * Create a new string-to-command association
	 * @param {string} string - String to associate
	 * @param {string} commandId - Command ID to associate with
	 */
	createAssociation(string, commandId) {
		if (!string || !commandId) {
			this.log('String and command are required');
			return false;
		}

		if (!this.commandConfigs.has(commandId)) {
			this.log(`Command not found: ${commandId}`);
			return false;
		}

		this.stringMappings.set(string.trim(), commandId);
		this._updateMappingsUI();

		// Select new random command
		this._selectRandomUnassociatedCommand();

		this.log(`Created association: "${string}" -> ${commandId}`);
		this._updateStatusDisplay(`Associated "${string}" with ${commandId}`);

		return true;
	}

	/**
	 * Remove a string association
	 * @param {string} string - String to remove association for
	 */
	removeAssociation(string) {
		const removed = this.stringMappings.delete(string);
		if (removed) {
			this._updateMappingsUI();
			this.log(`Removed association for: ${string}`);
			this._updateStatusDisplay(`Removed association for: ${string}`);
		}
		return removed;
	}

	/**
	 * Clear all string associations
	 */
	clearAllAssociations() {
		this.stringMappings.clear();
		this._updateMappingsUI();
		this._selectRandomUnassociatedCommand();
		this.log('Cleared all string associations');
		this._updateStatusDisplay('Cleared all associations');
		return true;
	}

	/**
	 * Reload chat commands from localStorage
	 */
	reloadCommands() {
		this._loadChatCommands();
		this._updateCommandSelect();
		this._selectRandomUnassociatedCommand();
		this.log('Reloaded chat commands');
		this._updateStatusDisplay(`Reloaded ${this.availableCommands.length} commands`);
		return this.availableCommands.length;
	}

	/**
	 * Set the selected command
	 * @param {string} commandId - Command ID to select
	 */
	setSelectedCommand(commandId) {
		if (commandId && !this.commandConfigs.has(commandId)) {
			this.log(`Command not found: ${commandId}`);
			return false;
		}

		this.selectedCommand = commandId;
		if (this._commandSelect) {
			this._commandSelect.value = commandId;
		}

		this.log(`Selected command: ${commandId}`);
		return true;
	}

	/**
	 * Set maximum duration for command execution
	 * @param {number} duration - Duration in milliseconds
	 */
	setMaxDuration(duration) {
		this.maxDuration = Math.max(50, Math.min(5000, duration));
		if (this._maxDurationInput) {
			this._maxDurationInput.value = this.maxDuration;
		}
		this.log(`Max duration set to ${this.maxDuration}ms`);
		return this.maxDuration;
	}

	/**
	 * Execute a command by ID
	 * @param {string} commandId - Command ID to execute
	 * @param {string} triggerString - String that triggered this command
	 */
	_executeCommand(commandId, triggerString) {
		const command = this.commandConfigs.get(commandId);
		if (!command) {
			this.log(`Command not found: ${commandId}`);
			return false;
		}

		// Set up command execution state
		this.executingString = triggerString;
		const frameCount = Math.ceil(this.maxDuration / 50);
		this.currentCommandStates = [];

		for (let i = 0; i < frameCount; i++) {
			this.currentCommandStates.push({
				digital: {},
				analog: {}
			});
		}

		// Apply command actions to state array
		this._applyCommandToStates(command);

		// Reset playback
		this.currentCommandIndex = 0;
		this.frameCounter = 0;

		this.log(`Executing command: ${commandId} (triggered by "${triggerString}")`);
		this._updateStatusDisplay(`Executing: ${commandId}`);

		// Clear status after execution
		setTimeout(() => {
			this._updateStatusDisplay('');
			this.executingString = null;
		}, this.maxDuration);

		return true;
	}

	/**
	 * Apply command actions to the state array
	 * @param {Object} command - Command configuration
	 */
	_applyCommandToStates(command) {
		const maxFrameCount = Math.min(
			Math.ceil((command.maxDuration || this.maxDuration) / 50),
			this.currentCommandStates.length
		);

		let currentFrame = 0;
		while (currentFrame < maxFrameCount) {
			for (const action of command.actions || []) {
				const actionFrameCount = Math.ceil((action.duration || 100) / 50);

				for (let i = 0; i < actionFrameCount && currentFrame < maxFrameCount; i++) {
					const stateFrame = this.currentCommandStates[currentFrame];

					// Apply digital states
					if (action.digital) {
						for (const [button, value] of Object.entries(action.digital)) {
							if (value) {
								stateFrame.digital[button] = true;
							}
						}
					}

					// Apply analog states
					if (action.analog) {
						for (const [stick, value] of Object.entries(action.analog)) {
							if (!stateFrame.analog[stick] || Math.abs(value) > Math.abs(stateFrame.analog[stick])) {
								stateFrame.analog[stick] = value;
							}
						}
					}

					currentFrame++;
				}
			}
		}
	}

	/**
	 * Update the mappings display
	 */
	_updateMappingsUI() {
		if (!this._mappingsContainer) return;

		this._mappingsContainer.innerHTML = '';

		if (this.stringMappings.size === 0) {
			const emptyMsg = document.createElement('div');
			emptyMsg.className = 'string-empty-message';
			emptyMsg.textContent = 'No string associations configured';
			this._mappingsContainer.appendChild(emptyMsg);
			return;
		}

		// Create mapping entries
		const sortedMappings = Array.from(this.stringMappings.entries()).sort();

		sortedMappings.forEach(([string, commandId]) => {
			const entry = document.createElement('div');
			entry.className = 'string-mapping-entry';

			const stringSpan = document.createElement('span');
			stringSpan.className = 'string-text';
			stringSpan.textContent = `"${string}"`;

			const arrow = document.createElement('span');
			arrow.className = 'string-arrow';
			arrow.textContent = '→';

			const commandSpan = document.createElement('span');
			commandSpan.className = 'string-command';
			commandSpan.textContent = commandId;

			const removeBtn = document.createElement('button');
			removeBtn.className = 'button danger small';
			removeBtn.textContent = '×';
			removeBtn.title = 'Remove association';
			removeBtn.addEventListener('click', () => {
				this.executeAction('removeAssociation', { string });
			});

			entry.appendChild(stringSpan);
			entry.appendChild(arrow);
			entry.appendChild(commandSpan);
			entry.appendChild(removeBtn);

			this._mappingsContainer.appendChild(entry);
		});
	}

	/**
	 * Update the command select dropdown
	 */
	_updateCommandSelect() {
		if (!this._commandSelect) return;

		const currentValue = this._commandSelect.value;
		this._commandSelect.innerHTML = '';

		// Add empty option
		const emptyOption = document.createElement('option');
		emptyOption.value = '';
		emptyOption.textContent = 'Select command...';
		this._commandSelect.appendChild(emptyOption);

		// Add all available commands
		this.availableCommands.forEach(commandId => {
			const option = document.createElement('option');
			option.value = commandId;
			option.textContent = commandId;
			this._commandSelect.appendChild(option);
		});

		// Restore selection if still valid
		if (this.availableCommands.includes(currentValue)) {
			this._commandSelect.value = currentValue;
		} else {
			this._commandSelect.value = this.selectedCommand || '';
		}
	}

	/**
	 * Update the status display
	 */
	_updateStatusDisplay(message = '') {
		if (this._statusDisplay) {
			this._statusDisplay.textContent = message;
			if (message) {
				this._statusDisplay.style.opacity = '1';
			} else {
				this._statusDisplay.style.opacity = '0.5';
			}
		}
	}

	_processInternal(state, deltaTime) {
		// Apply current command state if we have one
		if (this.currentCommandStates.length > 0 &&
			this.currentCommandIndex < this.currentCommandStates.length) {

			const commandState = this.currentCommandStates[this.currentCommandIndex];

			// Apply digital states
			for (const [button, value] of Object.entries(commandState.digital)) {
				if (value) {
					state.digital[button] = true;
				}
			}

			// Apply analog states
			for (const [stick, value] of Object.entries(commandState.analog)) {
				let controllerKey;
				switch (stick) {
					case 'stickLX': controllerKey = 'leftX'; break;
					case 'stickLY': controllerKey = 'leftY'; break;
					case 'stickRX': controllerKey = 'rightX'; break;
					case 'stickRY': controllerKey = 'rightY'; break;
					default: continue;
				}

				if (!state.analog[controllerKey] || Math.abs(value) > Math.abs(state.analog[controllerKey])) {
					state.analog[controllerKey] = value;
				}
			}

			// Advance to next frame every 50ms
			this.frameCounter += deltaTime;
			if (this.frameCounter >= 50) {
				this.frameCounter -= 50;
				this.currentCommandIndex++;
			}
		}

		return state;
	}

	createControls() {
		const container = document.createElement('div');
		container.className = 'manipulator-controls string-control-custom';

		// String input section
		const inputSection = document.createElement('div');
		inputSection.className = 'manipulator-control-group';

		const inputLabel = document.createElement('label');
		inputLabel.textContent = 'Enter string: ';

		this._stringInput = document.createElement('input');
		this._stringInput.type = 'text';
		this._stringInput.placeholder = 'Type string and press Enter...';
		this._stringInput.className = 'string-input';
		this._stringInput.addEventListener('keypress', (e) => {
			if (e.key === 'Enter') {
				const string = this._stringInput.value.trim();
				if (string) {
					this.executeAction('executeString', { string });
					this._stringInput.value = '';
				}
			}
		});

		const inputRow = document.createElement('div');
		inputRow.className = 'inline-with-gap';
		inputRow.appendChild(inputLabel);
		inputRow.appendChild(this._stringInput);

		inputSection.appendChild(inputRow);

		// Command selection section
		const commandSection = document.createElement('div');
		commandSection.className = 'manipulator-control-group';

		const commandLabel = document.createElement('label');
		commandLabel.textContent = 'Command if new: ';

		this._commandSelect = document.createElement('select');
		this._commandSelect.className = 'string-command-select';
		this._commandSelect.addEventListener('change', () => {
			this.executeAction('setSelectedCommand', { command: this._commandSelect.value });
		});

		const reloadBtn = document.createElement('button');
		reloadBtn.textContent = 'Reload';
		reloadBtn.className = 'button small';
		reloadBtn.addEventListener('click', () => {
			this.executeAction('reloadCommands');
		});

		const editlink = document.createElement('button');
		editlink.textContent = 'Edit';
		editlink.className = 'button small secondary';
		editlink.addEventListener('click', () => {
			const url = './command-edit.html';
			window.open(url, "_blank");
		});

		const commandRow = document.createElement('div');
		commandRow.className = 'inline-with-gap';
		commandRow.appendChild(commandLabel);
		commandRow.appendChild(this._commandSelect);
		commandRow.appendChild(reloadBtn);
		commandRow.appendChild(editlink);

		commandSection.appendChild(commandRow);

		// Max duration control
		const durationSection = document.createElement('div');
		durationSection.className = 'manipulator-control-group';

		const durationLabel = document.createElement('label');
		durationLabel.textContent = 'Max duration (ms): ';

		this._maxDurationInput = document.createElement('input');
		this._maxDurationInput.type = 'number';
		this._maxDurationInput.min = '50';
		this._maxDurationInput.max = '5000';
		this._maxDurationInput.step = '50';
		this._maxDurationInput.value = this.maxDuration;
		this._maxDurationInput.className = 'string-duration-input';
		this._maxDurationInput.addEventListener('change', () => {
			const newValue = parseInt(this._maxDurationInput.value);
			if (!isNaN(newValue)) {
				this.executeAction('setMaxDuration', { duration: newValue });
			}
		});

		const durationRow = document.createElement('div');
		durationRow.className = 'inline-with-gap';
		durationRow.appendChild(durationLabel);
		durationRow.appendChild(this._maxDurationInput);

		durationSection.appendChild(durationRow);

		// Status display
		const statusSection = document.createElement('div');
		statusSection.className = 'manipulator-control-group';

		this._statusDisplay = document.createElement('div');
		this._statusDisplay.className = 'string-status-display';
		this._statusDisplay.textContent = 'Ready';

		statusSection.appendChild(this._statusDisplay);

		// Quick actions
		const actionsSection = document.createElement('div');
		actionsSection.className = 'manipulator-control-group';

		const clearBtn = document.createElement('button');
		clearBtn.textContent = 'Clear All Associations';
		clearBtn.className = 'button small';
		clearBtn.addEventListener('click', () => {
			if (confirm('Remove all string associations?')) {
				this.executeAction('clearAllAssociations');
			}
		});

		const actionsRow = document.createElement('div');
		actionsRow.className = 'inline-with-gap';
		actionsRow.appendChild(clearBtn);

		actionsSection.appendChild(actionsRow);

		// Mappings display
		const mappingsSection = document.createElement('div');
		mappingsSection.className = 'manipulator-control-group';

		this._mappingsContainer = document.createElement('div');
		this._mappingsContainer.className = 'string-mappings-container';

		mappingsSection.appendChild(this._mappingsContainer);

		// Info box
		const infoSection = document.createElement('div');
		infoSection.className = 'info-box';
		infoSection.innerHTML = `
			<p><strong>How to use:</strong></p>
			<ul>
				<li>Type a string and press Enter</li>
				<li>If it's new, it gets associated with the selected command</li>
				<li>If it exists, the associated command runs</li>
				<li>The dropdown automatically selects a new random command after associations</li>
			</ul>
		`;

		// Assemble UI
		container.appendChild(inputSection);
		container.appendChild(commandSection);
		container.appendChild(durationSection);
		container.appendChild(statusSection);
		container.appendChild(actionsSection);
		container.appendChild(mappingsSection);
		container.appendChild(infoSection);

		// Initialize UI state
		this._updateCommandSelect();
		this._updateMappingsUI();
		this._updateStatusDisplay('Ready');

		// Add custom styles
		const style = document.createElement('style');
		style.textContent = `
			.string-input {
				flex: 1;
				padding: 5px 10px;
				font-size: 14px;
			}
			.string-status-display {
				padding: 8px 12px;
				background: rgba(0, 150, 255, 0.1);
				border-left: 3px solid #0096ff;
				border-radius: 4px;
				font-weight: bold;
				transition: opacity 0.3s ease;
			}
			.string-mappings-container {
				max-height: 300px;
				overflow-y: auto;
				border: 1px solid rgba(255, 255, 255, 0.1);
				border-radius: 4px;
				padding: 10px;
				background-color: rgba(0, 0, 0, 0.1);
			}

			.string-mapping-entry {
				display: flex;
				align-items: center;
				gap: 8px;
				padding: 6px 0;
				border-bottom: 1px solid rgba(255, 255, 255, 0.05);
			}

			.string-mapping-entry:last-child {
				border-bottom: none;
			}

			.string-text {
				background-color: rgba(0, 150, 255, 0.2);
				padding: 3px 8px;
				border-radius: 4px;
				font-family: monospace;
				font-size: 13px;
				color: #66ccff;
				font-weight: bold;
			}

			.string-arrow {
				color: rgba(255, 255, 255, 0.6);
				font-size: 14px;
				font-weight: bold;
			}

			.string-command {
				background-color: rgba(100, 255, 100, 0.1);
				padding: 3px 8px;
				border-radius: 4px;
				font-size: 12px;
				color: #88ff88;
				flex: 1;
			}
		`;
		container.appendChild(style);

		return container;
	}

	_getSpecificConfig() {
		// Convert Map to object for serialization
		const stringMappingsObj = {};
		this.stringMappings.forEach((command, string) => {
			stringMappingsObj[string] = command;
		});

		return {
			stringMappings: stringMappingsObj,
			selectedCommand: this.selectedCommand,
			maxDuration: this.maxDuration
		};
	}

	_setSpecificConfig(config) {
		if (config.stringMappings !== undefined) {
			this.stringMappings.clear();
			Object.entries(config.stringMappings).forEach(([string, command]) => {
				this.stringMappings.set(string, command);
			});
			this._updateMappingsUI();
		}

		if (config.selectedCommand !== undefined) {
			this.setSelectedCommand(config.selectedCommand);
		}

		if (config.maxDuration !== undefined) {
			this.setMaxDuration(config.maxDuration);
		}
	}

	dispose() {
		this.stringMappings.clear();
		this.commandConfigs.clear();
		this.currentCommandStates = [];

		this._stringInput = null;
		this._commandSelect = null;
		this._mappingsContainer = null;
		this._statusDisplay = null;
		this._maxDurationInput = null;

		super.dispose();
	}
}