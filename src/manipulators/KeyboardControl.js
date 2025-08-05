/**
 * ./src/manipulators/KeyboardControl.js
 *
 * Manipulator that converts keyboard input to gamepad state.
 * Listens for keyboard events and maps them to controller buttons.
 */
import { ControllerState } from '../core/ControllerState.js';
import { BaseManipulator } from './BaseManipulator.js';

/**
 * @typedef {Object} KeyboardControlParams
 * @property {boolean} [enabled=true] - Whether this manipulator is active
 * @property {Object<string, string>} [keyMappings={}] - Key to button mappings
 * @property {boolean} [captureEvents=true] - Whether to capture keyboard events
 */

export class KeyboardControl extends BaseManipulator {
	static get defaultConfig() {
		return {
			keyMappings: {
				// WASD for D-pad
				'KeyW': 'dpadUp',
				'KeyA': 'dpadLeft',
				'KeyS': 'dpadDown',
				'KeyD': 'dpadRight',

				// LKPO for face buttons (A, B, X, Y)
				'KeyL': 'buttonA',
				'KeyK': 'buttonB',
				'KeyP': 'buttonX',
				'KeyO': 'buttonY',

				// E and I for shoulder buttons (L, R)
				'KeyE': 'buttonL',
				'KeyI': 'buttonR',

				// Q and [ for triggers (ZL, ZR)
				'KeyQ': 'buttonZL',
				'BracketLeft': 'buttonZR',
			},
			captureEvents: true
		};
	}

	static get displayName() {
		return "Keyboard Control";
	}

	static get description() {
		return "Convert keyboard input to gamepad button presses.";
	}

	/**
	 * @param {KeyboardControlParams} params - Configuration parameters
	 */
	constructor(params = {}) {
		super(params);

		// Initialize key mappings
		// Use user mappings if provided, otherwise use defaults
		this.keyMappings = new Map();
		const mappingsToUse = params.keyMappings || this.constructor.defaultConfig.keyMappings;
		Object.entries(mappingsToUse).forEach(([key, button]) => {
			this.keyMappings.set(key, button);
		});

		this.captureEvents = params.captureEvents !== false;

		// Track currently pressed keys
		this.pressedKeys = new Set();

		// Keyboard event handlers
		this._onKeyDown = this._handleKeyDown.bind(this);
		this._onKeyUp = this._handleKeyUp.bind(this);
		this._onBlur = this._handleBlur.bind(this);

		// UI elements
		this._mappingContainer = null;
		this._captureCheckbox = null;

		// Register keyboard-specific actions
		this._registerKeyboardActions();

		// Start listening if enabled
		if (this.enabled && this.captureEvents) {
			this._startListening();
		}
	}

	/**
	 * Register actions specific to the keyboard manipulator
	 */
	_registerKeyboardActions() {
		this.registerAction({
			name: 'setKeyMapping',
			displayName: 'Set Key Mapping',
			description: 'Map a keyboard key to a gamepad button',
			parameters: [
				{
					name: 'key',
					type: 'string',
					description: 'Keyboard key code (e.g., "KeyW", "Space")',
					required: true
				},
				{
					name: 'button',
					type: 'string',
					description: 'Gamepad button name',
					required: true
				}
			],
			handler: (params) => this.setKeyMapping(params.key, params.button)
		});

		this.registerAction({
			name: 'removeKeyMapping',
			displayName: 'Remove Key Mapping',
			description: 'Remove a key mapping',
			parameters: [
				{
					name: 'key',
					type: 'string',
					description: 'Keyboard key code to remove',
					required: true
				}
			],
			handler: (params) => this.removeKeyMapping(params.key)
		});

		this.registerAction({
			name: 'clearAllMappings',
			displayName: 'Clear All Mappings',
			description: 'Remove all key mappings',
			handler: () => this.clearAllMappings()
		});

		this.registerAction({
			name: 'resetToDefaults',
			displayName: 'Reset to Defaults',
			description: 'Reset to default key mappings',
			handler: () => this.resetToDefaults()
		});

		this.registerAction({
			name: 'setCaptureEvents',
			displayName: 'Set Capture Events',
			description: 'Enable or disable keyboard event capture',
			parameters: [
				{
					name: 'capture',
					type: 'boolean',
					description: 'Whether to capture keyboard events',
					required: true
				}
			],
			handler: (params) => this.setCaptureEvents(params.capture)
		});

		this.registerAction({
			name: 'getKeyMappings',
			displayName: 'Get Key Mappings',
			description: 'Get all current key mappings',
			handler: () => this.getKeyMappings()
		});

		this.registerAction({
			name: 'getPressedKeys',
			displayName: 'Get Pressed Keys',
			description: 'Get currently pressed keys',
			handler: () => this.getPressedKeys()
		});
	}

	/**
	 * Set a key mapping
	 * @param {string} key - Keyboard key code
	 * @param {string} button - Gamepad button name
	 */
	setKeyMapping(key, button) {
		// Validate button name
		const validButtons = [
			'buttonA', 'buttonB', 'buttonX', 'buttonY',
			'dpadUp', 'dpadDown', 'dpadLeft', 'dpadRight',
			'buttonL', 'buttonR', 'buttonZL', 'buttonZR',
			'buttonThumbL', 'buttonThumbR'
		];

		if (!validButtons.includes(button)) {
			throw new Error(`Invalid button name: ${button}`);
		}

		this.keyMappings.set(key, button);
		this._updateMappingUI();
		this.log(`Mapped ${key} -> ${button}`);
		return true;
	}

	/**
	 * Remove a key mapping
	 * @param {string} key - Keyboard key code
	 */
	removeKeyMapping(key) {
		const removed = this.keyMappings.delete(key);
		if (removed) {
			this._updateMappingUI();
			this.log(`Removed mapping for ${key}`);
		}
		return removed;
	}

	/**
	 * Clear all key mappings
	 */
	clearAllMappings() {
		this.keyMappings.clear();
		this.pressedKeys.clear();
		this._updateMappingUI();
		this.log('Cleared all key mappings');
		return true;
	}

	/**
	 * Reset to default key mappings
	 */
	resetToDefaults() {
		this.keyMappings.clear();
		const defaultMappings = this.constructor.defaultConfig.keyMappings;
		Object.entries(defaultMappings).forEach(([key, button]) => {
			this.keyMappings.set(key, button);
		});
		this._updateMappingUI();
		this.log('Reset to default key mappings');
		return this.getKeyMappings();
	}

	/**
	 * Set whether to capture keyboard events
	 * @param {boolean} capture
	 */
	setCaptureEvents(capture) {
		if (this.captureEvents === capture) {
			return this.captureEvents;
		}

		this.captureEvents = capture;

		if (this.enabled) {
			if (capture) {
				this._startListening();
			} else {
				this._stopListening();
			}
		}

		// Update UI
		if (this._captureCheckbox) {
			this._captureCheckbox.checked = capture;
		}

		this.log(`Event capture ${capture ? 'enabled' : 'disabled'}`);
		return this.captureEvents;
	}

	/**
	 * Get all current key mappings
	 */
	getKeyMappings() {
		const mappings = {};
		this.keyMappings.forEach((button, key) => {
			mappings[key] = button;
		});
		return mappings;
	}

	/**
	 * Get currently pressed keys
	 */
	getPressedKeys() {
		return Array.from(this.pressedKeys);
	}

	/**
	 * Start listening for keyboard events
	 * @private
	 */
	_startListening() {
		if (!this.captureEvents) return;

		document.addEventListener('keydown', this._onKeyDown, { capture: true });
		document.addEventListener('keyup', this._onKeyUp, { capture: true });
		window.addEventListener('blur', this._onBlur);

		this.log('Started keyboard listening');
	}

	/**
	 * Stop listening for keyboard events
	 * @private
	 */
	_stopListening() {
		document.removeEventListener('keydown', this._onKeyDown, { capture: true });
		document.removeEventListener('keyup', this._onKeyUp, { capture: true });
		window.removeEventListener('blur', this._onBlur);

		// Clear pressed keys when stopping
		this.pressedKeys.clear();

		this.log('Stopped keyboard listening');
	}

	/**
	 * Handle keydown events
	 * @private
	 */
	_handleKeyDown(event) {
		if (!this.enabled || !this.captureEvents) return;

		const key = event.code;
		if (this.keyMappings.has(key)) {
			this.pressedKeys.add(key);

			// Prevent default behavior for mapped keys
			event.preventDefault();
			event.stopPropagation();
		}
	}

	/**
	 * Handle keyup events
	 * @private
	 */
	_handleKeyUp(event) {
		if (!this.enabled || !this.captureEvents) return;

		const key = event.code;
		if (this.keyMappings.has(key)) {
			this.pressedKeys.delete(key);

			// Prevent default behavior for mapped keys
			event.preventDefault();
			event.stopPropagation();
		}
	}

	/**
	 * Handle window blur (clear all pressed keys)
	 * @private
	 */
	_handleBlur() {
		this.pressedKeys.clear();
	}

	_processInternal(state, deltaTime) {
		// Apply keyboard mappings
		this.pressedKeys.forEach(key => {
			const button = this.keyMappings.get(key);
			if (button) {
				state.digital[button] = true;
			}
		});

		return state;
	}

	/**
	 * Update the mapping UI display
	 * @private
	 */
	_updateMappingUI() {
		if (!this._mappingContainer) return;

		// Clear existing content
		this._mappingContainer.innerHTML = '';

		if (this.keyMappings.size === 0) {
			const emptyMsg = document.createElement('div');
			emptyMsg.className = 'keyboard-empty-message';
			emptyMsg.textContent = 'No key mappings configured';
			this._mappingContainer.appendChild(emptyMsg);
			return;
		}

		// Create mapping entries
		const sortedMappings = Array.from(this.keyMappings.entries()).sort();

		sortedMappings.forEach(([key, button]) => {
			const entry = document.createElement('div');
			entry.className = 'keyboard-mapping-entry';

			const keySpan = document.createElement('span');
			keySpan.className = 'keyboard-key';
			keySpan.textContent = this._formatKeyName(key);

			const arrow = document.createElement('span');
			arrow.className = 'keyboard-arrow';
			arrow.textContent = '→';

			const buttonSpan = document.createElement('span');
			buttonSpan.className = 'keyboard-button';
			buttonSpan.textContent = this._formatButtonName(button);

			const removeBtn = document.createElement('button');
			removeBtn.className = 'keyboard-remove-btn';
			removeBtn.textContent = '×';
			removeBtn.title = 'Remove mapping';
			removeBtn.addEventListener('click', () => {
				this.executeAction('removeKeyMapping', { key });
			});

			entry.appendChild(keySpan);
			entry.appendChild(arrow);
			entry.appendChild(buttonSpan);
			entry.appendChild(removeBtn);

			this._mappingContainer.appendChild(entry);
		});
	}

	/**
	 * Format key name for display
	 * @private
	 */
	_formatKeyName(keyCode) {
		const keyNames = {
			'KeyA': 'A', 'KeyB': 'B', 'KeyC': 'C', 'KeyD': 'D', 'KeyE': 'E', 'KeyF': 'F',
			'KeyG': 'G', 'KeyH': 'H', 'KeyI': 'I', 'KeyJ': 'J', 'KeyK': 'K', 'KeyL': 'L',
			'KeyM': 'M', 'KeyN': 'N', 'KeyO': 'O', 'KeyP': 'P', 'KeyQ': 'Q', 'KeyR': 'R',
			'KeyS': 'S', 'KeyT': 'T', 'KeyU': 'U', 'KeyV': 'V', 'KeyW': 'W', 'KeyX': 'X',
			'KeyY': 'Y', 'KeyZ': 'Z',
			'Space': 'Space',
			'ShiftLeft': 'L-Shift',
			'ShiftRight': 'R-Shift',
			'ControlLeft': 'L-Ctrl',
			'ControlRight': 'R-Ctrl',
			'AltLeft': 'L-Alt',
			'AltRight': 'R-Alt',
			'BracketLeft': '[',
			'BracketRight': ']',
			'ArrowUp': '↑',
			'ArrowDown': '↓',
			'ArrowLeft': '←',
			'ArrowRight': '→'
		};

		return keyNames[keyCode] || keyCode;
	}

	/**
	 * Format button name for display
	 * @private
	 */
	_formatButtonName(button) {
		const buttonNames = {
			'buttonA': 'A',
			'buttonB': 'B',
			'buttonX': 'X',
			'buttonY': 'Y',
			'dpadUp': '↑',
			'dpadDown': '↓',
			'dpadLeft': '←',
			'dpadRight': '→',
			'buttonL': 'L',
			'buttonR': 'R',
			'buttonZL': 'ZL',
			'buttonZR': 'ZR',
			'buttonThumbL': 'L3',
			'buttonThumbR': 'R3'
		};

		return buttonNames[button] || button;
	}

	createControls() {
		const container = document.createElement('div');
		container.className = 'manipulator-controls';

		// Capture events checkbox
		const captureGroup = document.createElement('div');
		captureGroup.className = 'manipulator-control-group';

		const captureLabel = document.createElement('label');
		captureLabel.className = 'keyboard-label';

		this._captureCheckbox = document.createElement('input');
		this._captureCheckbox.type = 'checkbox';
		this._captureCheckbox.checked = this.captureEvents;
		this._captureCheckbox.addEventListener('change', () => {
			this.executeAction('setCaptureEvents', {
				capture: this._captureCheckbox.checked
			});
		});

		const captureText = document.createElement('span');
		captureText.textContent = 'Capture keyboard events';

		captureLabel.appendChild(this._captureCheckbox);
		captureLabel.appendChild(captureText);
		captureGroup.appendChild(captureLabel);

		// Quick action buttons
		const quickActions = document.createElement('div');
		quickActions.className = 'keyboard-quick-actions';

		const resetBtn = document.createElement('button');
		resetBtn.textContent = 'Reset to Defaults';
		resetBtn.className = 'button small';
		resetBtn.addEventListener('click', () => {
			this.executeAction('resetToDefaults');
		});

		const clearBtn = document.createElement('button');
		clearBtn.textContent = 'Clear All';
		clearBtn.className = 'button small';
		clearBtn.addEventListener('click', () => {
			this.executeAction('clearAllMappings');
		});

		quickActions.appendChild(resetBtn);
		quickActions.appendChild(clearBtn);

		// Add new mapping section
		const addMappingGroup = document.createElement('div');
		addMappingGroup.className = 'inline-with-gap';

		const addTitle = document.createElement('div');
		addTitle.className = 'keyboard-add-title';
		addTitle.textContent = 'Add New Mapping:';

		const addForm = document.createElement('div');
		addForm.className = 'inline-with-gap';

		// Button dropdown
		const buttonSelect = document.createElement('select');
		buttonSelect.className = 'keyboard-button-select';

		// Add button options
		const buttonOptions = [
			{ value: '', text: 'Select button...' },
			{ value: 'buttonA', text: 'A' },
			{ value: 'buttonB', text: 'B' },
			{ value: 'buttonX', text: 'X' },
			{ value: 'buttonY', text: 'Y' },
			{ value: 'dpadUp', text: 'D-pad Up' },
			{ value: 'dpadDown', text: 'D-pad Down' },
			{ value: 'dpadLeft', text: 'D-pad Left' },
			{ value: 'dpadRight', text: 'D-pad Right' },
			{ value: 'buttonL', text: 'L (Left Shoulder)' },
			{ value: 'buttonR', text: 'R (Right Shoulder)' },
			{ value: 'buttonZL', text: 'ZL (Left Trigger)' },
			{ value: 'buttonZR', text: 'ZR (Right Trigger)' },
			{ value: 'buttonThumbL', text: 'L3 (Left Stick)' },
			{ value: 'buttonThumbR', text: 'R3 (Right Stick)' }
		];

		buttonOptions.forEach(option => {
			const optionEl = document.createElement('option');
			optionEl.value = option.value;
			optionEl.textContent = option.text;
			buttonSelect.appendChild(optionEl);
		});

		// Key input
		const keyInput = document.createElement('input');
		keyInput.type = 'text';
		keyInput.placeholder = 'Click here...';
		keyInput.className = 'keyboard-key-input';
		keyInput.readOnly = true;

		// Add button
		const addButton = document.createElement('button');
		addButton.textContent = 'Add Mapping';
		addButton.className = 'button small';
		addButton.disabled = true;

		// Key capture logic
		let capturingKey = false;
		const originalCaptureEvents = this.captureEvents;

		keyInput.addEventListener('focus', () => {
			if (!capturingKey) {
				capturingKey = true;
				keyInput.placeholder = 'Press any key...';
				keyInput.style.backgroundColor = 'rgba(136, 138, 255, 0.2)';

				// Temporarily disable main capture to avoid conflicts
				this.setCaptureEvents(false);

				const captureHandler = (event) => {
					event.preventDefault();
					event.stopPropagation();

					keyInput.value = this._formatKeyName(event.code);
					keyInput.dataset.keyCode = event.code;
					keyInput.blur();

					document.removeEventListener('keydown', captureHandler, true);
					capturingKey = false;
					keyInput.placeholder = 'Click here...';
					keyInput.style.backgroundColor = '';

					// Restore original capture setting
					this.setCaptureEvents(originalCaptureEvents);

					// Enable add button if both fields are filled
					this._updateAddButtonState();
				};

				document.addEventListener('keydown', captureHandler, true);
			}
		});

		keyInput.addEventListener('blur', () => {
			if (capturingKey) {
				capturingKey = false;
				keyInput.placeholder = 'Click here...';
				keyInput.style.backgroundColor = '';
				this.setCaptureEvents(originalCaptureEvents);
			}
		});

		// Update add button state
		const updateAddButtonState = () => {
			addButton.disabled = !keyInput.dataset.keyCode || !buttonSelect.value;
		};
		this._updateAddButtonState = updateAddButtonState;

		buttonSelect.addEventListener('change', updateAddButtonState);

		// Add mapping when button clicked
		addButton.addEventListener('click', () => {
			const keyCode = keyInput.dataset.keyCode;
			const button = buttonSelect.value;

			if (keyCode && button) {
				try {
					this.executeAction('setKeyMapping', { key: keyCode, button });

					// Clear the form
					keyInput.value = '';
					keyInput.dataset.keyCode = '';
					buttonSelect.value = '';
					updateAddButtonState();

				} catch (error) {
					alert(`Error adding mapping: ${error.message}`);
				}
			}
		});

		addForm.appendChild(buttonSelect);
		addForm.appendChild(keyInput);
		addForm.appendChild(addButton);

		addMappingGroup.appendChild(addTitle);
		addMappingGroup.appendChild(addForm);

		// Info box
		const infobox = document.createElement('div');
		infobox.className = 'info-box';
		infobox.innerHTML = `
			<p><strong>Note:</strong> Window must have focus to read keyboard input.</p>
			<p><strong>Default Mappings:</strong> D-pad = WASD | ABXY = LKPO | LR = EI | ZL/ZR = Q[</p>
		`;

		// Mappings container
		this._mappingContainer = document.createElement('div');
		this._mappingContainer.className = 'keyboard-mappings-container';

		container.appendChild(captureGroup);
		container.appendChild(infobox);
		container.appendChild(quickActions);
		container.appendChild(addMappingGroup);
		container.appendChild(this._mappingContainer);

		// Initialize mappings display
		this._updateMappingUI();

		// Add custom styles
		const style = document.createElement('style');
		style.textContent = `
			.keyboard-label {
				display: flex;
				align-items: center;
				gap: 8px;
				font-size: 14px;
			}

			.keyboard-quick-actions {
				display: flex;
				gap: 10px;
				margin-bottom: 15px;
				flex-wrap: wrap;
			}

			.keyboard-mappings-container {
				max-height: 300px;
				overflow-y: auto;
				border: 1px solid rgba(255, 255, 255, 0.1);
				border-radius: 4px;
				padding: 10px;
				background-color: rgba(0, 0, 0, 0.1);
			}

			.keyboard-mapping-entry {
				display: flex;
				align-items: center;
				gap: 8px;
				padding: 4px 0;
				border-bottom: 1px solid rgba(255, 255, 255, 0.05);
			}

			.keyboard-mapping-entry:last-child {
				border-bottom: none;
			}

			.keyboard-key {
				background-color: rgba(255, 255, 255, 0.1);
				padding: 2px 6px;
				border-radius: 3px;
				font-family: monospace;
				font-size: 12px;
				min-width: 40px;
				text-align: center;
			}

			.keyboard-arrow {
				color: rgba(255, 255, 255, 0.6);
				font-size: 14px;
			}

			.keyboard-remove-btn {
				background-color: rgba(255, 100, 100, 0.2);
				color: #ff6666;
				border: none;
				border-radius: 2px;
				padding: 2px 6px;
				cursor: pointer;
				font-size: 12px;
				font-weight: bold;
				margin-left: auto;
			}

			.keyboard-remove-btn:hover {
				background-color: rgba(255, 100, 100, 0.4);
			}

			.keyboard-empty-message {
				text-align: center;
				color: rgba(255, 255, 255, 0.6);
				font-style: italic;
				padding: 20px;
			}

			.keyboard-status {
				margin-bottom: 15px;
			}

			.keyboard-key-input {
				max-width: 120px;
				cursor: pointer;
			}
			`;
		container.appendChild(style);

		return container;
	}

	onEnabledChanged(enabled) {
		if (enabled && this.captureEvents) {
			this._startListening();
		} else {
			this._stopListening();
		}
	}

	_getSpecificConfig() {
		return {
			keyMappings: this.getKeyMappings(),
			captureEvents: this.captureEvents
		};
	}

	_setSpecificConfig(config) {
		if (config.keyMappings !== undefined) {
			this.keyMappings.clear();
			Object.entries(config.keyMappings).forEach(([key, button]) => {
				this.keyMappings.set(key, button);
			});
			this._updateMappingUI();
		}

		if (config.captureEvents !== undefined) {
			this.setCaptureEvents(config.captureEvents);
		}
	}

	onDetach() {
		this._stopListening();
	}

	dispose() {
		this._stopListening();
		this.pressedKeys.clear();
		this.keyMappings.clear();
		this._mappingContainer = null;
		this._captureCheckbox = null;
		super.dispose();
	}
}