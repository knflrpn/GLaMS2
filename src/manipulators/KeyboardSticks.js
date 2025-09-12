/**
 * ./src/manipulators/KeyboardSticks.js
 *
 * Manipulator that converts keyboard input to analog stick movements.
 * Listens for keyboard events and maps them to analog stick values.
 */
import { BaseManipulator } from './BaseManipulator.js';

/**
 * @typedef {Object} KeyboardSticksParams
 * @property {boolean} [enabled=true] - Whether this manipulator is active
 * @property {Object<string, string>} [keyMappings={}] - Key to stick direction mappings
 * @property {boolean} [captureEvents=true] - Whether to capture keyboard events
 * @property {number} [magnitude=1.0] - Analog stick magnitude (0.1 to 2.0)
 */

export class KeyboardSticks extends BaseManipulator {
	static get defaultConfig() {
		return {
			keyMappings: {
				// WASD for left stick
				'KeyW': 'leftUp',
				'KeyA': 'leftLeft',
				'KeyS': 'leftDown',
				'KeyD': 'leftRight',

				// Arrow keys for right stick
				'ArrowUp': 'rightUp',
				'ArrowLeft': 'rightLeft',
				'ArrowDown': 'rightDown',
				'ArrowRight': 'rightRight',
			},
			captureEvents: true,
			magnitude: 1.0
		};
	}

	static get displayName() {
		return "Keyboard Sticks";
	}

	static get description() {
		return "Convert keyboard input to analog stick movements.";
	}

	/**
	 * @param {KeyboardSticksParams} params - Configuration parameters
	 */
	constructor(params = {}) {
		super(params);

		// Initialize key mappings
		this.keyMappings = new Map();
		const mappingsToUse = params.keyMappings || this.constructor.defaultConfig.keyMappings;
		Object.entries(mappingsToUse).forEach(([key, direction]) => {
			this.keyMappings.set(key, direction);
		});

		this.captureEvents = params.captureEvents !== false;
		this.magnitude = Math.max(0.1, Math.min(2.0, params.magnitude || 1.0));

		// Track currently pressed keys
		this.keyStates = new Map();

		// Keyboard event handlers
		this._onKeyDown = this._handleKeyDown.bind(this);
		this._onKeyUp = this._handleKeyUp.bind(this);
		this._onBlur = this._handleBlur.bind(this);

		// UI elements
		this._mappingContainer = null;
		this._captureCheckbox = null;
		this._magnitudeSlider = null;

		// Register keyboard-specific actions
		this._registerKeyboardSticksActions();

		// Start listening if enabled
		if (this.enabled && this.captureEvents) {
			this._startListening();
		}
	}

	/**
	 * Register actions specific to the keyboard sticks manipulator
	 */
	_registerKeyboardSticksActions() {
		this.registerAction({
			name: 'setKeyMapping',
			displayName: 'Set Key Mapping',
			description: 'Map a keyboard key to an analog stick direction',
			parameters: [
				{
					name: 'key',
					type: 'string',
					description: 'Keyboard key code (e.g., "KeyW", "Space")',
					required: true
				},
				{
					name: 'direction',
					type: 'string',
					description: 'Stick direction (leftUp, leftDown, leftLeft, leftRight, rightUp, rightDown, rightLeft, rightRight)',
					required: true
				}
			],
			handler: (params) => this.setKeyMapping(params.key, params.direction)
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
			name: 'setmagnitude',
			displayName: 'Set magnitude',
			description: 'Set analog stick magnitude',
			parameters: [
				{
					name: 'magnitude',
					type: 'number',
					description: 'magnitude value (0.1 to 1.0)',
					required: true
				}
			],
			handler: (params) => this.setmagnitude(params.magnitude)
		});

		this.registerAction({
			name: 'getKeyMappings',
			displayName: 'Get Key Mappings',
			description: 'Get all current key mappings',
			handler: () => this.getKeyMappings()
		});
	}

	/**
	 * Set a key mapping
	 * @param {string} key - Keyboard key code
	 * @param {string} direction - Stick direction
	 */
	setKeyMapping(key, direction) {
		// Validate direction name
		const validDirections = [
			'leftUp', 'leftDown', 'leftLeft', 'leftRight',
			'rightUp', 'rightDown', 'rightLeft', 'rightRight'
		];

		if (!validDirections.includes(direction)) {
			throw new Error(`Invalid direction: ${direction}`);
		}

		this.keyMappings.set(key, direction);
		this._updateMappingUI();
		this.log(`Mapped ${key} -> ${direction}`);
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
		this.keyStates.clear();
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
		Object.entries(defaultMappings).forEach(([key, direction]) => {
			this.keyMappings.set(key, direction);
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
	 * Set analog stick magnitude
	 * @param {number} magnitude - magnitude value (0.1 to 1.0)
	 */
	setmagnitude(magnitude) {
		this.magnitude = Math.max(0.1, Math.min(1.0, magnitude));

		// Update UI
		if (this._magnitudeSlider) {
			this._magnitudeSlider.value = this.magnitude;
		}
		if (this._magnitudeValue) {
			this._magnitudeValue.textContent = this.magnitude.toFixed(1);
		}

		this.log(`magnitude set to ${this.magnitude.toFixed(1)}`);
		return this.magnitude;
	}

	/**
	 * Get all current key mappings
	 */
	getKeyMappings() {
		const mappings = {};
		this.keyMappings.forEach((direction, key) => {
			mappings[key] = direction;
		});
		return mappings;
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
		this.keyStates.clear();

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
			// Set to pressed state (overwrites any previous state)
			this.keyStates.set(key, 'pressed');

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
			const currentState = this.keyStates.get(key);

			if (currentState === 'processed') {
				// Key has already caused stick movement, safe to delete immediately
				this.keyStates.delete(key);
			} else if (currentState === 'pressed') {
				// Key hasn't been processed yet, mark for pending deletion
				this.keyStates.set(key, 'pendingDeletion');
			}

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
		this.keyStates.clear();
	}

	_processInternal(state, deltaTime) {
		// Initialize stick values
		let leftX = 0, leftY = 0, rightX = 0, rightY = 0;

		// Process all keys and accumulate stick values
		for (const [key, keyState] of this.keyStates) {
			const direction = this.keyMappings.get(key);
			if (!direction) continue;

			let shouldApply = false;
			if (keyState === 'pressed') {
				// Normal pressed key - activate and mark as processed
				shouldApply = true;
				this.keyStates.set(key, 'processed');
			} else if (keyState === 'pendingDeletion') {
				// Key pending deletion - give it one final frame then remove
				shouldApply = true;
				this.keyStates.delete(key);
			} else if (keyState === 'processed') {
				// Processed keys that are still held
				shouldApply = true;
			}

			if (shouldApply) {
				// Apply movement based on direction
				switch (direction) {
					case 'leftUp':
						leftY -= this.magnitude;
						break;
					case 'leftDown':
						leftY += this.magnitude;
						break;
					case 'leftLeft':
						leftX -= this.magnitude;
						break;
					case 'leftRight':
						leftX += this.magnitude;
						break;
					case 'rightUp':
						rightY -= this.magnitude;
						break;
					case 'rightDown':
						rightY += this.magnitude;
						break;
					case 'rightLeft':
						rightX -= this.magnitude;
						break;
					case 'rightRight':
						rightX += this.magnitude;
						break;
				}
			}
		}

		// Clamp values to [-1, 1]
		leftX = Math.max(-1, Math.min(1, leftX));
		leftY = Math.max(-1, Math.min(1, leftY));
		rightX = Math.max(-1, Math.min(1, rightX));
		rightY = Math.max(-1, Math.min(1, rightY));

		// Apply to controller state (additive with existing values)
		state.analog.leftX = Math.max(-1, Math.min(1, state.analog.leftX + leftX));
		state.analog.leftY = Math.max(-1, Math.min(1, state.analog.leftY + leftY));
		state.analog.rightX = Math.max(-1, Math.min(1, state.analog.rightX + rightX));
		state.analog.rightY = Math.max(-1, Math.min(1, state.analog.rightY + rightY));

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
			emptyMsg.className = 'keyboard-sticks-empty-message';
			emptyMsg.textContent = 'No key mappings configured';
			this._mappingContainer.appendChild(emptyMsg);
			return;
		}

		// Create mapping entries
		const sortedMappings = Array.from(this.keyMappings.entries()).sort();

		sortedMappings.forEach(([key, direction]) => {
			const entry = document.createElement('div');
			entry.className = 'keyboard-sticks-mapping-entry';

			const keySpan = document.createElement('span');
			keySpan.className = 'keyboard-sticks-key';
			keySpan.textContent = this._formatKeyName(key);

			const arrow = document.createElement('span');
			arrow.className = 'keyboard-sticks-arrow';
			arrow.textContent = '→';

			const directionSpan = document.createElement('span');
			directionSpan.className = 'keyboard-sticks-direction';
			directionSpan.textContent = this._formatDirectionName(direction);

			const removeBtn = document.createElement('button');
			removeBtn.className = 'keyboard-sticks-remove-btn';
			removeBtn.textContent = '×';
			removeBtn.title = 'Remove mapping';
			removeBtn.addEventListener('click', () => {
				this.executeAction('removeKeyMapping', { key });
			});

			entry.appendChild(keySpan);
			entry.appendChild(arrow);
			entry.appendChild(directionSpan);
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
	 * Format direction name for display
	 * @private
	 */
	_formatDirectionName(direction) {
		const directionNames = {
			'leftUp': 'Left ↑',
			'leftDown': 'Left ↓',
			'leftLeft': 'Left ←',
			'leftRight': 'Left →',
			'rightUp': 'Right ↑',
			'rightDown': 'Right ↓',
			'rightLeft': 'Right ←',
			'rightRight': 'Right →'
		};

		return directionNames[direction] || direction;
	}

	createControls() {
		const container = document.createElement('div');
		container.className = 'manipulator-controls keyboard-sticks-custom';

		// Capture events checkbox
		const captureGroup = document.createElement('div');
		captureGroup.className = 'manipulator-control-group';

		const captureLabel = document.createElement('label');
		captureLabel.className = 'keyboard-sticks-label';

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

		// magnitude control
		const magnitudeGroup = document.createElement('div');
		magnitudeGroup.className = 'manipulator-control-group';

		const magnitudeLabel = document.createElement('div');
		magnitudeLabel.className = 'keyboard-sticks-magnitude-label';
		magnitudeLabel.textContent = 'magnitude: ';

		this._magnitudeValue = document.createElement('span');
		this._magnitudeValue.className = 'keyboard-sticks-magnitude-value';
		this._magnitudeValue.textContent = this.magnitude.toFixed(1);

		magnitudeLabel.appendChild(this._magnitudeValue);

		this._magnitudeSlider = document.createElement('input');
		this._magnitudeSlider.type = 'range';
		this._magnitudeSlider.min = '0.1';
		this._magnitudeSlider.max = '1.0';
		this._magnitudeSlider.step = '0.1';
		this._magnitudeSlider.value = this.magnitude;
		this._magnitudeSlider.className = 'keyboard-sticks-magnitude-slider';
		this._magnitudeSlider.addEventListener('input', () => {
			this.executeAction('setmagnitude', {
				magnitude: parseFloat(this._magnitudeSlider.value)
			});
		});

		magnitudeGroup.appendChild(magnitudeLabel);
		magnitudeGroup.appendChild(this._magnitudeSlider);

		// Quick action buttons
		const quickActions = document.createElement('div');
		quickActions.className = 'keyboard-sticks-quick-actions';

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
		addTitle.className = 'keyboard-sticks-add-title';
		addTitle.textContent = 'Add New Mapping:';

		const addForm = document.createElement('div');
		addForm.className = 'inline-with-gap';

		// Direction dropdown
		const directionSelect = document.createElement('select');
		directionSelect.className = 'keyboard-sticks-direction-select';

		// Add direction options
		const directionOptions = [
			{ value: '', text: 'Select direction...' },
			{ value: 'leftUp', text: 'Left Stick Up' },
			{ value: 'leftDown', text: 'Left Stick Down' },
			{ value: 'leftLeft', text: 'Left Stick Left' },
			{ value: 'leftRight', text: 'Left Stick Right' },
			{ value: 'rightUp', text: 'Right Stick Up' },
			{ value: 'rightDown', text: 'Right Stick Down' },
			{ value: 'rightLeft', text: 'Right Stick Left' },
			{ value: 'rightRight', text: 'Right Stick Right' }
		];

		directionOptions.forEach(option => {
			const optionEl = document.createElement('option');
			optionEl.value = option.value;
			optionEl.textContent = option.text;
			directionSelect.appendChild(optionEl);
		});

		// Key input
		const keyInput = document.createElement('input');
		keyInput.type = 'text';
		keyInput.placeholder = 'Click here...';
		keyInput.className = 'keyboard-sticks-key-input';
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
			addButton.disabled = !keyInput.dataset.keyCode || !directionSelect.value;
		};
		this._updateAddButtonState = updateAddButtonState;

		directionSelect.addEventListener('change', updateAddButtonState);

		// Add mapping when button clicked
		addButton.addEventListener('click', () => {
			const keyCode = keyInput.dataset.keyCode;
			const direction = directionSelect.value;

			if (keyCode && direction) {
				try {
					this.executeAction('setKeyMapping', { key: keyCode, direction });

					// Clear the form
					keyInput.value = '';
					keyInput.dataset.keyCode = '';
					directionSelect.value = '';
					updateAddButtonState();

				} catch (error) {
					alert(`Error adding mapping: ${error.message}`);
				}
			}
		});

		addForm.appendChild(directionSelect);
		addForm.appendChild(keyInput);
		addForm.appendChild(addButton);

		addMappingGroup.appendChild(addTitle);
		addMappingGroup.appendChild(addForm);

		// Info box
		const infobox = document.createElement('div');
		infobox.className = 'info-box';
		infobox.innerHTML = `
			<p><strong>Note:</strong> Window must have focus to read keyboard input.</p>
			<p><strong>Default Mappings:</strong> Left Stick = WASD | Right Stick = Arrow Keys</p>
		`;

		// Mappings container
		this._mappingContainer = document.createElement('div');
		this._mappingContainer.className = 'keyboard-sticks-mappings-container';

		container.appendChild(captureGroup);
		container.appendChild(infobox);
		container.appendChild(magnitudeGroup);
		container.appendChild(quickActions);
		container.appendChild(addMappingGroup);
		container.appendChild(this._mappingContainer);

		// Initialize mappings display
		this._updateMappingUI();

		// Add custom styles
		const style = document.createElement('style');
		style.textContent = `
			.keyboard-sticks-label {
				display: flex;
				align-items: center;
				gap: 8px;
				font-size: 14px;
			}

			.keyboard-sticks-magnitude-label {
				font-size: 14px;
				margin-bottom: 5px;
			}

			.keyboard-sticks-magnitude-value {
				font-weight: bold;
				color: #88aaff;
			}

			.keyboard-sticks-magnitude-slider {
				width: 100%;
				margin-top: 5px;
			}

			.keyboard-sticks-quick-actions {
				display: flex;
				gap: 10px;
				margin-bottom: 15px;
				flex-wrap: wrap;
			}

			.keyboard-sticks-mappings-container {
				max-height: 300px;
				overflow-y: auto;
				border: 1px solid rgba(255, 255, 255, 0.1);
				border-radius: 4px;
				padding: 10px;
				background-color: rgba(0, 0, 0, 0.1);
			}

			.keyboard-sticks-mapping-entry {
				display: flex;
				align-items: center;
				gap: 8px;
				padding: 4px 0;
				border-bottom: 1px solid rgba(255, 255, 255, 0.05);
			}

			.keyboard-sticks-mapping-entry:last-child {
				border-bottom: none;
			}

			.keyboard-sticks-key {
				background-color: rgba(255, 255, 255, 0.1);
				padding: 2px 6px;
				border-radius: 3px;
				font-family: monospace;
				font-size: 12px;
				min-width: 40px;
				text-align: center;
			}

			.keyboard-sticks-arrow {
				color: rgba(255, 255, 255, 0.6);
				font-size: 14px;
			}

			.keyboard-sticks-direction {
				background-color: rgba(136, 170, 255, 0.2);
				color: #88aaff;
				padding: 2px 6px;
				border-radius: 3px;
				font-size: 12px;
				min-width: 60px;
				text-align: center;
			}

			.keyboard-sticks-remove-btn {
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

			.keyboard-sticks-remove-btn:hover {
				background-color: rgba(255, 100, 100, 0.4);
			}

			.keyboard-sticks-empty-message {
				text-align: center;
				color: rgba(255, 255, 255, 0.6);
				font-style: italic;
				padding: 20px;
			}

			.keyboard-sticks-key-input {
				max-width: 120px;
				cursor: pointer;
			}

			.keyboard-sticks-direction-select {
				min-width: 140px;
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
			captureEvents: this.captureEvents,
			magnitude: this.magnitude
		};
	}

	_setSpecificConfig(config) {
		if (config.keyMappings !== undefined) {
			this.keyMappings.clear();
			Object.entries(config.keyMappings).forEach(([key, direction]) => {
				this.keyMappings.set(key, direction);
			});
			this._updateMappingUI();
		}

		if (config.captureEvents !== undefined) {
			this.setCaptureEvents(config.captureEvents);
		}

		if (config.magnitude !== undefined) {
			this.setmagnitude(config.magnitude);
		}
	}

	onDetach() {
		this._stopListening();
	}

	dispose() {
		this._stopListening();
		this.keyStates.clear();
		this.keyMappings.clear();
		this._mappingContainer = null;
		this._captureCheckbox = null;
		this._magnitudeSlider = null;
		this._magnitudeValue = null;
		super.dispose();
	}
}