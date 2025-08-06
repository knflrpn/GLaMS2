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
			cooldown: 0,
			userCooldown: 0,
			minDuration: 50,
			maxDuration: 2000,
			probability: 1.0,
			exclusive: false,
			actions: []
		};

		this.currentCommandIndex = -1;
		this.isDirty = false;
		// Add an initial action.
		this.addAction();
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
		// If user has entered a keyword but forgot to submit it, submit it for them.
		const tempkeyword = document.getElementById('keywordInput').value;
		if (tempkeyword) this.addKeyword(tempkeyword);

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
		this.currentCommand = null;
		this.currentCommandIndex = -1;
		this.updateCommandList();
		this.showStatus('Command saved successfully', 'success');
		this.autoSave();
		this.renderEditor();

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

	clearCommands() {
		if (!confirm('Are you sure you want to delete ALL commands?')) {
			return;
		}

		this.commands = [];
		this.currentCommand = null;
		this.currentCommandIndex = -1;
		this.isDirty = false;

		this.updateCommandList();
		this.renderEditor();
		this.showStatus('Commands cleared', 'success');
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

	initializeStickControlsForAction(actionIndex) {
		// Update visual positions for just this action's sticks
		const action = this.currentCommand.actions[actionIndex];

		// Update left stick
		const leftX = action.analog.stickLX || 0;
		const leftY = action.analog.stickLY || 0;
		this.updateStickVisualPosition(actionIndex, 'left', leftX, leftY);

		// Update right stick
		const rightX = action.analog.stickRX || 0;
		const rightY = action.analog.stickRY || 0;
		this.updateStickVisualPosition(actionIndex, 'right', rightX, rightY);
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
			this.updateActionNumbers();
			this.updateMoveButtonStates();
			this.renderActions();
		}
	}

	updateActionNumbers() {
		const actionItems = document.querySelectorAll('.action-item');
		actionItems.forEach((item, index) => {
			const numberSpan = item.querySelector('.action-number');
			if (numberSpan) {
				numberSpan.textContent = `Action ${index + 1}`;
			}
		});
	}

	updateMoveButtonStates() {
		const actionItems = document.querySelectorAll('.action-item');
		actionItems.forEach((item, index) => {
			const upButton = item.querySelector('button[onclick*="moveAction"]');
			const downButton = item.querySelectorAll('button[onclick*="moveAction"]')[1];

			if (upButton) upButton.disabled = index === 0;
			if (downButton) downButton.disabled = index === this.currentCommand.actions.length - 1;
		});
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
                        <input type="text" id="keywordInput" placeholder="New keyword..." 
                               onkeypress="if(event.key==='Enter') { commandEditor.addKeyword(this.value); this.value=''; }">
                        <button class="button small" onclick="commandEditor.addKeyword(document.getElementById('keywordInput').value); document.getElementById('keywordInput').value='';">
                            Add to list
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
                            <input type="range" value="${this.currentCommand.probability}" min="0" max="1" step="0.02"
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
                <button class="button" onclick="commandEditor.addAction()">+ Another Action</button>
            </div>

            <div class="action-buttons">
                <button class="button" onclick="commandEditor.saveCommand()">
                    ${this.currentCommandIndex === -1 ? 'Create Command' : 'Update Command'}
                </button>
                ${this.currentCommandIndex !== -1 ? '<button class="button danger" onclick="commandEditor.deleteCommand()">Delete Command</button>' : ''}
                <button class="button secondary" onclick="commandEditor.currentCommand = null; commandEditor.currentCommandIndex = -1; commandEditor.isDirty = false; commandEditor.renderEditor();">
                    Cancel
                </button>
            </div>
        `;

		this.renderKeywords();
		this.renderActions();
		setTimeout(() => { this.initializeStickControls(); }, 0);
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

		// Initialize stick controls after DOM is updated
		setTimeout(() => {
			this.initializeStickControls();
		}, 0);

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
                <div style="display: flex; align-items: center; gap: 10px;">
                    <input type="range" value="${action.duration}" min="50" max="2000" step="50"
                           oninput="commandEditor.updateAction(${index}, 'duration', parseInt(this.value)); document.getElementById('durationValue${index}').textContent = this.value + 'ms';">
                    <span id="durationValue${index}" class="slider-value">${action.duration}ms</span>
                </div>
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
                    <div class="stick-area" data-stick="left" data-action="${index}">
                        <div class="center-cross"></div>
                        <div class="stick-thumb" data-stick="left" data-action="${index}"></div>
                    </div>
                    <div class="stick-values">
                        <div>X: <span class="x-value">${(action.analog.stickLX || 0).toFixed(1)}</span></div>
                        <div>Y: <span class="y-value">${(action.analog.stickLY || 0).toFixed(1)}</span></div>
                    </div>
                    <button class="reset-stick-btn" onclick="commandEditor.resetStick(${index}, 'left')">Reset</button>
                </div>
                
                <div class="stick-control">
                    <h5>Right Stick</h5>
                    <div class="stick-area" data-stick="right" data-action="${index}">
                        <div class="center-cross"></div>
                        <div class="stick-thumb" data-stick="right" data-action="${index}"></div>
                    </div>
                    <div class="stick-values">
                        <div>X: <span class="x-value">${(action.analog.stickRX || 0).toFixed(1)}</span></div>
                        <div>Y: <span class="y-value">${(action.analog.stickRY || 0).toFixed(1)}</span></div>
                    </div>
                    <button class="reset-stick-btn" onclick="commandEditor.resetStick(${index}, 'right')">Reset</button>
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
		this.updateButtonVisual(actionIndex, button, !!action.digital[button]);
	}

	updateButtonVisual(actionIndex, button, isActive) {
		const buttonElement = document.querySelector(
			`.action-item:nth-child(${actionIndex + 1}) .button-toggle:nth-child(${this.availableButtons.indexOf(button) + 1})`
		);
		if (buttonElement) {
			if (isActive) {
				buttonElement.classList.add('active');
			} else {
				buttonElement.classList.remove('active');
			}
		}
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
			timestamp: new Date().toISOString(),
			commands: this.commands
		};

		const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `ChatCommands.json`;
		a.click();
		URL.revokeObjectURL(url);

		this.showStatus('Configuration exported successfully!', 'success');
	}

	importConfig(event) {
		const file = event.target.files[0];
		if (file) {
			this.loadConfigFile(file);
			event.target.value = '';
		}
	}

	appendConfig(event) {
		const file = event.target.files[0];
		if (file) {
			this.appendConfigFile(file);
			event.target.value = '';
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

				this.updateCommandList();
				this.renderEditor();
				this.showStatus('Configuration imported successfully!', 'success');
			} catch (error) {
				this.showStatus('Failed to import configuration: ' + error.message, 'error');
			}
		};
		reader.readAsText(file);
	}

	appendConfigFile(file) {
		const reader = new FileReader();
		reader.onload = (e) => {
			try {
				const config = JSON.parse(e.target.result);

				// Validate the config structure
				if (!config.commands || !Array.isArray(config.commands)) {
					throw new Error('Invalid configuration format');
				}

				// Get existing keywords for comparison
				const existingKeywords = new Set();
				this.commands.forEach(cmd => {
					cmd.keywords.forEach(keyword => {
						existingKeywords.add(keyword.toLowerCase());
					});
				});

				// Filter out commands that have any overlapping keywords
				const newCommands = config.commands.filter(newCmd => {
					// Check if any of this command's keywords already exist
					return !newCmd.keywords.some(keyword =>
						existingKeywords.has(keyword.toLowerCase())
					);
				});

				// Add the new commands
				this.commands.push(...newCommands);

				// Update UI
				this.updateCommandList();
				this.renderEditor();

				const addedCount = newCommands.length;
				const skippedCount = config.commands.length - newCommands.length;

				let message = `Added ${addedCount} new command(s)`;
				if (skippedCount > 0) {
					message += `, skipped ${skippedCount} existing command(s)`;
				}

				this.showStatus(message, 'success');
				this.autoSave();

			} catch (error) {
				this.showStatus('Failed to append configuration: ' + error.message, 'error');
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

	initializeStickControls() {
		// Initialize stick drag functionality after rendering
		this.bindStickEvents();
		this.updateAllStickPositions();
	}

	bindStickEvents() {
		// Remove existing listeners to prevent duplicates
		if (this.stickEventsBound) {
			document.removeEventListener('mousedown', this.handleStickMouseDown);
			document.removeEventListener('mousemove', this.handleStickMouseMove);
			document.removeEventListener('mouseup', this.handleStickMouseUp);
			document.removeEventListener('touchstart', this.handleStickTouchStart);
			document.removeEventListener('touchmove', this.handleStickTouchMove);
			document.removeEventListener('touchend', this.handleStickTouchEnd);
		}

		this.isDraggingStick = false;
		this.currentStickData = null;

		// Bind the methods to maintain 'this' context
		this.handleStickMouseDown = this.handleStickMouseDown.bind(this);
		this.handleStickMouseMove = this.handleStickMouseMove.bind(this);
		this.handleStickMouseUp = this.handleStickMouseUp.bind(this);
		this.handleStickTouchStart = this.handleStickTouchStart.bind(this);
		this.handleStickTouchMove = this.handleStickTouchMove.bind(this);
		this.handleStickTouchEnd = this.handleStickTouchEnd.bind(this);

		// Add event listeners
		document.addEventListener('mousedown', this.handleStickMouseDown);
		document.addEventListener('mousemove', this.handleStickMouseMove);
		document.addEventListener('mouseup', this.handleStickMouseUp);
		document.addEventListener('touchstart', this.handleStickTouchStart, { passive: false });
		document.addEventListener('touchmove', this.handleStickTouchMove, { passive: false });
		document.addEventListener('touchend', this.handleStickTouchEnd);

		this.stickEventsBound = true;
	}

	getStickAreaFromEvent(e) {
		const target = e.target;
		if (target.classList.contains('stick-area')) {
			return target;
		}
		if (target.classList.contains('stick-thumb')) {
			return target.parentElement;
		}
		return target.closest('.stick-area');
	}

	calculateStickValues(stickArea, clientX, clientY) {
		const rect = stickArea.getBoundingClientRect();
		const centerX = rect.left + rect.width / 2;
		const centerY = rect.top + rect.height / 2;

		// Calculate relative position from center
		let x = (clientX - centerX) / (rect.width / 2);
		let y = (clientY - centerY) / (rect.height / 2);

		// Clamp to bounds
		if (x > 1) x = 1;
		if (x < -1) x = -1;
		if (y > 1) y = 1;
		if (y < -1) y = -1;

		// Round to reasonable precision
		x = Math.round(x * 20) / 20;
		y = Math.round(y * 20) / 20;

		return { x, y };
	}

	updateStickVisualPosition(actionIndex, stickName, x, y) {
		const stickArea = document.querySelector(`.stick-area[data-stick="${stickName}"][data-action="${actionIndex}"]`);
		if (!stickArea) return;

		const thumb = stickArea.querySelector('.stick-thumb');
		const valueContainer = stickArea.parentElement.querySelector('.stick-values');

		// Update thumb position (convert from -1,1 range to pixel position)
		const centerX = stickArea.offsetWidth / 2;
		const centerY = stickArea.offsetHeight / 2;
		const thumbX = centerX + (x * (stickArea.offsetWidth / 2 - 8)); // -8 for thumb radius
		const thumbY = centerY + (y * (stickArea.offsetHeight / 2 - 8));

		thumb.style.left = thumbX + 'px';
		thumb.style.top = thumbY + 'px';

		// Update value display
		valueContainer.querySelector('.x-value').textContent = x.toFixed(1);
		valueContainer.querySelector('.y-value').textContent = y.toFixed(1);
	}

	updateAllStickPositions() {
		if (!this.currentCommand) return;

		this.currentCommand.actions.forEach((action, actionIndex) => {
			// Update left stick
			const leftX = action.analog.stickLX || 0;
			const leftY = action.analog.stickLY || 0;
			this.updateStickVisualPosition(actionIndex, 'left', leftX, leftY);

			// Update right stick
			const rightX = action.analog.stickRX || 0;
			const rightY = action.analog.stickRY || 0;
			this.updateStickVisualPosition(actionIndex, 'right', rightX, rightY);
		});
	}

	handleStickMouseDown(e) {
		const stickArea = this.getStickAreaFromEvent(e);
		if (!stickArea) return;

		e.preventDefault();
		this.startStickDrag(stickArea, e.clientX, e.clientY);
	}

	handleStickTouchStart(e) {
		const stickArea = this.getStickAreaFromEvent(e);
		if (!stickArea) return;

		e.preventDefault();
		const touch = e.touches[0];
		this.startStickDrag(stickArea, touch.clientX, touch.clientY);
	}

	startStickDrag(stickArea, clientX, clientY) {
		this.isDraggingStick = true;
		this.currentStickData = {
			stickName: stickArea.dataset.stick,
			actionIndex: parseInt(stickArea.dataset.action),
			stickArea: stickArea
		};

		const thumb = stickArea.querySelector('.stick-thumb');
		thumb.classList.add('dragging');

		// Immediately update position
		const values = this.calculateStickValues(stickArea, clientX, clientY);
		this.updateStickPosition(this.currentStickData.actionIndex, this.currentStickData.stickName, values.x, values.y);
	}

	handleStickMouseMove(e) {
		if (!this.isDraggingStick) return;
		this.continueStickDrag(e.clientX, e.clientY);
	}

	handleStickTouchMove(e) {
		if (!this.isDraggingStick) return;
		e.preventDefault();
		const touch = e.touches[0];
		this.continueStickDrag(touch.clientX, touch.clientY);
	}

	continueStickDrag(clientX, clientY) {
		const values = this.calculateStickValues(this.currentStickData.stickArea, clientX, clientY);
		this.updateStickPosition(this.currentStickData.actionIndex, this.currentStickData.stickName, values.x, values.y);
	}

	handleStickMouseUp() {
		this.endStickDrag();
	}

	handleStickTouchEnd() {
		this.endStickDrag();
	}

	endStickDrag() {
		if (!this.isDraggingStick) return;

		this.isDraggingStick = false;

		if (this.currentStickData) {
			const thumb = this.currentStickData.stickArea.querySelector('.stick-thumb');
			thumb.classList.remove('dragging');
		}

		this.currentStickData = null;
	}

	updateStickPosition(actionIndex, stickName, x, y) {
		const action = this.currentCommand.actions[actionIndex];

		// Update the action data
		if (stickName === 'left') {
			if (x === 0) {
				delete action.analog.stickLX;
			} else {
				action.analog.stickLX = x;
			}
			if (y === 0) {
				delete action.analog.stickLY;
			} else {
				action.analog.stickLY = y;
			}
		} else if (stickName === 'right') {
			if (x === 0) {
				delete action.analog.stickRX;
			} else {
				action.analog.stickRX = x;
			}
			if (y === 0) {
				delete action.analog.stickRY;
			} else {
				action.analog.stickRY = y;
			}
		}

		this.isDirty = true;
		this.updateStickVisualPosition(actionIndex, stickName, x, y);
	}

	resetStick(actionIndex, stickName) {
		this.updateStickPosition(actionIndex, stickName, 0, 0);
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
	if (this.stickEventsBound) {
		document.removeEventListener('mousedown', this.handleStickMouseDown);
		document.removeEventListener('mousemove', this.handleStickMouseMove);
		document.removeEventListener('mouseup', this.handleStickMouseUp);
		document.removeEventListener('touchstart', this.handleStickTouchStart);
		document.removeEventListener('touchmove', this.handleStickTouchMove);
		document.removeEventListener('touchend', this.handleStickTouchEnd);
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