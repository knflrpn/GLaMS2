/**
 * Twitch Chat Command Editor
 * Allows users to create and edit command configurations for the TwitchChat manipulator
 */

class CommandEditor {
	constructor() {
		this.commands = [];
		this.currentCommandIndex = -1;
		this.currentCommand = null;
		this.isDirty = false;

		// Available buttons based on the controller structure
		this.availableButtons = [
			'buttonA', 'buttonB', 'buttonX', 'buttonY',
			'buttonL', 'buttonR', 'buttonZL', 'buttonZR',
			'dpadUp', 'dpadDown', 'dpadLeft', 'dpadRight',
			'buttonThumbL', 'buttonThumbR',
			'buttonPlus', 'buttonMinus',
			'buttonHome', 'buttonCapture'
		];

		// Button display names
		this.buttonDisplayNames = {
			'buttonA': 'A',
			'buttonB': 'B',
			'buttonX': 'X',
			'buttonY': 'Y',
			'buttonL': 'L',
			'buttonR': 'R',
			'buttonZL': 'ZL',
			'buttonZR': 'ZR',
			'dpadUp': 'D-Up',
			'dpadDown': 'D-Down',
			'dpadLeft': 'D-Left',
			'dpadRight': 'D-Right',
			'buttonThumbL': 'L3',
			'buttonThumbR': 'R3',
			'buttonPlus': 'Plus',
			'buttonMinus': 'Minus',
			'buttonHome': 'Home',
			'buttonCapture': 'Capture'
		};

		this.init();
	}

	init() {
		// Set up drag and drop
		const dropZone = document.getElementById('dropZone');
		if (dropZone) {
			dropZone.addEventListener('dragover', (e) => {
				e.preventDefault();
				dropZone.classList.add('drag-over');
			});

			dropZone.addEventListener('dragleave', () => {
				dropZone.classList.remove('drag-over');
			});

			dropZone.addEventListener('drop', (e) => {
				e.preventDefault();
				dropZone.classList.remove('drag-over');

				const file = e.dataTransfer.files[0];
				if (file && file.type === 'application/json') {
					this.loadConfigFile(file);
				}
			});
		}

		// Load any existing configuration from localStorage
		this.loadFromLocalStorage();
	}

	// Command Management
	newCommand() {
		if (this.isDirty && !confirm('You have unsaved changes. Create new command anyway?')) {
			return;
		}

		this.currentCommand = {
			keywords: [],
			cooldown: 1000,
			userCooldown: 5000,
			minDuration: 50,
			maxDuration: 2000,
			probability: 1.0,
			exclusive: false,
			actions: []
		};

		this.currentCommandIndex = -1;
		this.isDirty = false;
		this.renderEditor();
	}

	loadCommand(index) {
		if (this.isDirty && !confirm('You have unsaved changes. Load command anyway?')) {
			return;
		}

		if (index >= 0 && index < this.commands.length) {
			this.currentCommand = JSON.parse(JSON.stringify(this.commands[index])); // Deep clone
			this.currentCommandIndex = index;
			this.isDirty = false;
			this.renderEditor();
			this.updateCommandList();
		}
	}

	saveCommand() {
		if (!this.validateCommand()) {
			return;
		}

		if (this.currentCommandIndex === -1) {
			// New command
			this.commands.push(JSON.parse(JSON.stringify(this.currentCommand)));
			this.currentCommandIndex = this.commands.length - 1;
		} else {
			// Update existing
			this.commands[this.currentCommandIndex] = JSON.parse(JSON.stringify(this.currentCommand));
		}

		this.isDirty = false;
		this.updateCommandList();
		this.showStatus('Command saved successfully', 'success');
		this.autoSave();
	}

	deleteCommand() {
		if (this.currentCommandIndex === -1) {
			return;
		}

		if (!confirm('Are you sure you want to delete this command?')) {
			return;
		}

		this.commands.splice(this.currentCommandIndex, 1);
		this.currentCommand = null;
		this.currentCommandIndex = -1;
		this.isDirty = false;

		this.updateCommandList();
		this.renderEditor();
		this.showStatus('Command deleted', 'success');
		this.autoSave();
	}

	validateCommand() {
		if (!this.currentCommand) {
			this.showStatus('No command to save', 'error');
			return false;
		}

		if (this.currentCommand.keywords.length === 0) {
			this.showStatus('Command must have at least one keyword', 'error');
			return false;
		}

		if (this.currentCommand.actions.length === 0) {
			this.showStatus('Command must have at least one action', 'error');
			return false;
		}

		// Validate durations
		if (this.currentCommand.minDuration > this.currentCommand.maxDuration) {
			this.showStatus('Minimum duration cannot be greater than maximum duration', 'error');
			return false;
		}

		return true;
	}

	// Keyword Management
	addKeyword(keyword) {
		if (!keyword || !keyword.trim()) return;

		keyword = keyword.trim().toLowerCase();
		if (!this.currentCommand.keywords.includes(keyword)) {
			this.currentCommand.keywords.push(keyword);
			this.isDirty = true;
			this.renderKeywords();
		}
	}

	removeKeyword(index) {
		this.currentCommand.keywords.splice(index, 1);
		this.isDirty = true;
		this.renderKeywords();
	}

	// Action Management
	addAction() {
		const action = {
			digital: {},
			analog: {},
			duration: 100
		};

		this.currentCommand.actions.push(action);
		this.isDirty = true;
		this.renderActions();
	}

	updateAction(index, field, value) {
		if (index >= 0 && index < this.currentCommand.actions.length) {
			if (field === 'duration') {
				// Ensure duration is in 50ms increments and capped at 2000
				value = Math.round(value / 50) * 50;
				value = Math.min(2000, Math.max(50, value));
			}
			this.currentCommand.actions[index][field] = value;
			this.isDirty = true;
		}
	}

	removeAction(index) {
		this.currentCommand.actions.splice(index, 1);
		this.isDirty = true;
		this.renderActions();
	}

	moveAction(index, direction) {
		const newIndex = index + direction;
		if (newIndex >= 0 && newIndex < this.currentCommand.actions.length) {
			const temp = this.currentCommand.actions[index];
			this.currentCommand.actions[index] = this.currentCommand.actions[newIndex];
			this.currentCommand.actions[newIndex] = temp;
			this.isDirty = true;
			this.renderActions();
		}
	}

	// UI Rendering
	renderEditor() {
		const container = document.getElementById('editorContent');
		if (!this.currentCommand) {
			container.innerHTML = `
                <div class="empty-state">
                    <h4>No Command Selected</h4>
                    <p>Select a command from the list or create a new one to get started</p>
                </div>
            `;
			return;
		}

		container.innerHTML = `
            <div class="form-section">
                <h3>Command Settings</h3>
                
                <div class="form-field">
                    <label>Keywords 
                        <span class="tooltip">ℹ️
                            <span class="tooltiptext">Words that trigger this command in chat</span>
                        </span>
                    </label>
                    <div class="keywords-container" id="keywordsContainer"></div>
                    <div style="display: flex; gap: 10px;">
                        <input type="text" id="keywordInput" placeholder="Add keyword..." 
                               onkeypress="if(event.key==='Enter') { commandEditor.addKeyword(this.value); this.value=''; }">
                        <button class="button small" onclick="commandEditor.addKeyword(document.getElementById('keywordInput').value); document.getElementById('keywordInput').value='';">
                            Add
                        </button>
                    </div>
                </div>

                <div class="form-grid" style="margin-top: 20px;">
                    <div class="form-field">
                        <label>Cooldown (ms)</label>
                        <input type="number" value="${this.currentCommand.cooldown}" min="0" step="50"
                               onchange="commandEditor.updateCommandField('cooldown', parseInt(this.value))">
                        <p class="help-text">Global cooldown for this command</p>
                    </div>

                    <div class="form-field">
                        <label>User Cooldown (ms)</label>
                        <input type="number" value="${this.currentCommand.userCooldown}" min="0" step="50"
                               onchange="commandEditor.updateCommandField('userCooldown', parseInt(this.value))">
                        <p class="help-text">Per-user cooldown</p>
                    </div>

                    <div class="form-field">
                        <label>Min Duration (ms)</label>
                        <input type="number" value="${this.currentCommand.minDuration}" min="50" max="2000" step="50"
                               onchange="commandEditor.updateCommandField('minDuration', parseInt(this.value))">
                        <p class="help-text">Minimum total duration</p>
                    </div>

                    <div class="form-field">
                        <label>Max Duration (ms)</label>
                        <input type="number" value="${this.currentCommand.maxDuration}" min="50" max="2000" step="50"
                               onchange="commandEditor.updateCommandField('maxDuration', parseInt(this.value))">
                        <p class="help-text">Maximum total duration</p>
                    </div>

                    <div class="form-field">
                        <label>Probability</label>
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <input type="range" value="${this.currentCommand.probability}" min="0" max="1" step="0.1"
                                   oninput="commandEditor.updateCommandField('probability', parseFloat(this.value)); document.getElementById('probValue').textContent = (this.value * 100).toFixed(0) + '%';">
                            <span id="probValue" class="slider-value">${(this.currentCommand.probability * 100).toFixed(0)}%</span>
                        </div>
                        <p class="help-text">Chance this command executes</p>
                    </div>

                    <div class="form-field">
                        <label>
                            <input type="checkbox" ${this.currentCommand.exclusive ? 'checked' : ''}
                                   onchange="commandEditor.updateCommandField('exclusive', this.checked)">
                            Exclusive
                        </label>
                        <p class="help-text">Cannot combine with other commands</p>
                    </div>
                </div>
            </div>

            <div class="form-section">
                <h3>Actions</h3>
                <div id="actionsContainer"></div>
                <button class="button" onclick="commandEditor.addAction()">+ Add Action</button>
            </div>

            <div class="action-buttons">
                <button class="button" onclick="commandEditor.saveCommand()">
                    ${this.currentCommandIndex === -1 ? 'Create Command' : 'Update Command'}
                </button>
                ${this.currentCommandIndex !== -1 ? '<button class="button danger" onclick="commandEditor.deleteCommand()">Delete Command</button>' : ''}
                <button class="button secondary" onclick="commandEditor.currentCommand = null; commandEditor.currentCommandIndex = -1; commandEditor.renderEditor();">
                    Cancel
                </button>
            </div>
        `;

		this.renderKeywords();
		this.renderActions();
	}

	renderKeywords() {
		const container = document.getElementById('keywordsContainer');
		if (!container) return;

		container.innerHTML = this.currentCommand.keywords.map((keyword, index) => `
            <div class="keyword-tag">
                ${keyword}
                <button onclick="commandEditor.removeKeyword(${index})">×</button>
            </div>
        `).join('');
	}

	renderActions() {
		const container = document.getElementById('actionsContainer');
		if (!container) return;

		if (this.currentCommand.actions.length === 0) {
			container.innerHTML = '<p style="color: #9ca3af; text-align: center; padding: 20px;">No actions yet. Add one to get started!</p>';
			return;
		}

		container.innerHTML = this.currentCommand.actions.map((action, index) => this.renderAction(action, index)).join('');
	}

	renderAction(action, index) {
		return `
            <div class="action-item">
                <div class="action-header">
                    <span class="action-number">Action ${index + 1}</span>
                    <div style="display: flex; gap: 10px;">
                        <button class="button small" onclick="commandEditor.moveAction(${index}, -1)" 
                                ${index === 0 ? 'disabled' : ''}>↑</button>
                        <button class="button small" onclick="commandEditor.moveAction(${index}, 1)"
                                ${index === this.currentCommand.actions.length - 1 ? 'disabled' : ''}>↓</button>
                        <button class="button small danger" onclick="commandEditor.removeAction(${index})">Remove</button>
                    </div>
                </div>

                <div class="form-field">
                    <label>Duration (ms)</label>
                    <input type="number" value="${action.duration}" min="50" max="2000" step="50"
                           onchange="commandEditor.updateAction(${index}, 'duration', parseInt(this.value))">
                </div>

                <h5 style="margin-top: 15px; margin-bottom: 10px;">Digital Buttons</h5>
                <div class="button-grid">
                    ${this.availableButtons.map(button => `
                        <div class="button-toggle ${action.digital[button] ? 'active' : ''}"
                             onclick="commandEditor.toggleButton(${index}, '${button}')">
                            ${this.buttonDisplayNames[button]}
                        </div>
                    `).join('')}
                </div>

                <h5 style="margin-top: 15px; margin-bottom: 10px;">Analog Sticks</h5>
                <div class="analog-controls">
                    <div class="stick-control">
                        <h5>Left Stick</h5>
                        <div class="stick-inputs">
                            <div>
                                <label>X: <span id="leftX-${index}" style="color: #a5b4fc;">${action.analog.stickLX || 0}</span></label>
                                <input type="range" value="${action.analog.stickLX || 0}" min="-1" max="1" step="0.1"
                                       oninput="commandEditor.updateAnalog(${index}, 'stickLX', parseFloat(this.value)); document.getElementById('leftX-${index}').textContent = this.value;">
                            </div>
                            <div>
                                <label>Y: <span id="leftY-${index}" style="color: #a5b4fc;">${action.analog.stickLY || 0}</span></label>
                                <input type="range" value="${action.analog.stickLY || 0}" min="-1" max="1" step="0.1"
                                       oninput="commandEditor.updateAnalog(${index}, 'stickLY', parseFloat(this.value)); document.getElementById('leftY-${index}').textContent = this.value;">
                            </div>
                        </div>
                    </div>
                    
                    <div class="stick-control">
                        <h5>Right Stick</h5>
                        <div class="stick-inputs">
                            <div>
                                <label>X: <span id="rightX-${index}" style="color: #a5b4fc;">${action.analog.stickRX || 0}</span></label>
                                <input type="range" value="${action.analog.stickRX || 0}" min="-1" max="1" step="0.1"
                                       oninput="commandEditor.updateAnalog(${index}, 'stickRX', parseFloat(this.value)); document.getElementById('rightX-${index}').textContent = this.value;">
                            </div>
                            <div>
                                <label>Y: <span id="rightY-${index}" style="color: #a5b4fc;">${action.analog.stickRY || 0}</span></label>
                                <input type="range" value="${action.analog.stickRY || 0}" min="-1" max="1" step="0.1"
                                       oninput="commandEditor.updateAnalog(${index}, 'stickRY', parseFloat(this.value)); document.getElementById('rightY-${index}').textContent = this.value;">
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
	}

	updateCommandField(field, value) {
		this.currentCommand[field] = value;
		this.isDirty = true;

		// Validate duration fields
		if (field === 'minDuration' || field === 'maxDuration') {
			const min = this.currentCommand.minDuration;
			const max = this.currentCommand.maxDuration;

			if (min > max) {
				if (field === 'minDuration') {
					this.currentCommand.maxDuration = min;
				} else {
					this.currentCommand.minDuration = max;
				}
				this.renderEditor();
			}
		}
	}

	toggleButton(actionIndex, button) {
		const action = this.currentCommand.actions[actionIndex];
		if (action.digital[button]) {
			delete action.digital[button];
		} else {
			action.digital[button] = true;
		}
		this.isDirty = true;
		this.renderActions();
	}

	updateAnalog(actionIndex, stick, value) {
		const action = this.currentCommand.actions[actionIndex];
		if (value === 0) {
			delete action.analog[stick];
		} else {
			action.analog[stick] = value;
		}
		this.isDirty = true;
	}

	updateCommandList() {
		const container = document.getElementById('commandList');
		if (!container) return;

		if (this.commands.length === 0) {
			container.innerHTML = '<p style="text-align: center; color: #9ca3af; padding: 20px;">No commands yet</p>';
			return;
		}

		container.innerHTML = this.commands.map((cmd, index) => `
            <div class="command-item ${index === this.currentCommandIndex ? 'active' : ''}" 
                 onclick="commandEditor.loadCommand(${index})">
                <strong>Command ${index + 1}</strong>
                <div class="command-item-keywords">${cmd.keywords.join(', ')}</div>
            </div>
        `).join('');
	}

	// Configuration Management
	publishConfig() {
		if (this.isDirty) {
			this.showStatus('Please save your current command before publishing', 'error');
			return;
		}

		const config = {
			name: "default",
			timestamp: new Date().toISOString(),
			commands: this.commands
		};

		// Save to localStorage
		localStorage.setItem(`chatConfig_default`, JSON.stringify(config));

		// If TwitchChatConfigs is available (in the same window), update it
		if (window.TwitchChatConfigs) {
			window.TwitchChatConfigs.saveConfig("default", config);
		}

		this.showStatus(`Configuration published successfully!`, 'success');
	}

	exportConfig() {
		const config = {
			name: configName,
			timestamp: new Date().toISOString(),
			commands: this.commands
		};

		const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `${configName.replace(/\s+/g, '-')}.json`;
		a.click();
		URL.revokeObjectURL(url);

		this.showStatus('Configuration exported successfully!', 'success');
	}

	importConfig(event) {
		const file = event.target.files[0];
		if (file) {
			this.loadConfigFile(file);
		}
	}

	loadConfigFile(file) {
		const reader = new FileReader();
		reader.onload = (e) => {
			try {
				const config = JSON.parse(e.target.result);

				// Validate the config structure
				if (!config.commands || !Array.isArray(config.commands)) {
					throw new Error('Invalid configuration format');
				}

				// Load the commands
				this.commands = config.commands;
				this.currentCommand = null;
				this.currentCommandIndex = -1;
				this.isDirty = false;

				// Update the config name if provided
				if (config.name) {
					document.getElementById('configName').value = config.name;
				}

				this.updateCommandList();
				this.renderEditor();
				this.showStatus('Configuration imported successfully!', 'success');
			} catch (error) {
				this.showStatus('Failed to import configuration: ' + error.message, 'error');
			}
		};
		reader.readAsText(file);
	}

	loadFromLocalStorage() {
		// Try to load a default configuration
		const saved = localStorage.getItem('chatConfig_default');
		if (saved) {
			try {
				const config = JSON.parse(saved);
				this.commands = config.commands || [];
				this.updateCommandList();
			} catch (error) {
				console.error('Failed to load saved configuration:', error);
			}
		}
	}

	autoSave() {
		if (this.commands.length > 0) {
			const config = {
				name: 'default',
				timestamp: new Date().toISOString(),
				commands: this.commands
			};
			localStorage.setItem('chatConfig_default', JSON.stringify(config));
		}
	}

	showStatus(message, type = 'success') {
		const container = document.getElementById('statusMessage');
		if (!container) return;

		container.className = `status-message ${type}`;
		container.textContent = message;
		container.style.display = 'block';

		setTimeout(() => {
			container.style.display = 'none';
		}, 5000);
	}
}

// Initialize the editor
const commandEditor = new CommandEditor();

// Auto-save every 30 seconds
setInterval(() => {
	commandEditor.autoSave();
}, 30000);

// Warn before leaving if there are unsaved changes
window.addEventListener('beforeunload', (e) => {
	if (commandEditor.isDirty) {
		e.preventDefault();
		e.returnValue = '';
	}
});

// Initialize TwitchChatConfigs if it doesn't exist (for standalone testing)
if (!window.TwitchChatConfigs) {
	window.TwitchChatConfigs = {
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
			const configs = [];
			for (let i = 0; i < localStorage.length; i++) {
				const key = localStorage.key(i);
				if (key.startsWith('chatConfig_')) {
					configs.push(key.replace('chatConfig_', ''));
				}
			}
			return configs;
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