/**
 * ./src/manipulators/MouseControl.js
 *
 * Manipulator that captures mouse movement and converts it to analog stick input.
 * Can control either left stick, right stick, or both sticks independently.
 */
import { BaseManipulator } from './BaseManipulator.js';

/**
 * @typedef {Object} MouseControlParams
 * @property {'left'|'right'|'both'} [target='right'] - Which stick(s) to control
 * @property {number} [sensitivity=1.0] - Mouse sensitivity multiplier (0.1-5.0)
 * @property {boolean} [invertX=false] - Invert X-axis movement
 * @property {boolean} [invertY=false] - Invert Y-axis movement
 * @property {number} [deadzone=0.1] - Deadzone for stick input (0-0.5)
 * @property {boolean} [decay=false] - Enable decay to center when mouse stops moving
 * @property {number} [decaySpeed=0.2] - Speed of decay animation (0-1)
 * @property {boolean} [clamp=true] - Clamp virtual stick position to [-1,1] range
 * @property {boolean} [passThrough=true] - Pass through existing analog values
 */

export class MouseControl extends BaseManipulator {
	static get defaultConfig() {
		return {
			target: 'left',
			sensitivity: 1.0,
			invertX: false,
			invertY: false,
			deadzone: 0.1,
			decay: false,
			decaySpeed: 0.2,
			clamp: true,
			passThrough: true,
			leftClickAction: 'none',
			leftClickButton: 'buttonA',
			rightClickAction: 'none',
			rightClickButton: 'buttonA'
		};
	}

	static get displayName() {
		return "Mouse Control";
	}

	static get description() {
		return "Convert mouse movement to analog stick input with customizable controls.";
	}

	/**
	 * @param {MouseControlParams} params - Configuration parameters
	 */
	constructor(params = {}) {
		super(params);

		this.target = params.target ?? 'left';
		this.sensitivity = params.sensitivity ?? 1.0;
		this.invertX = params.invertX ?? false;
		this.invertY = params.invertY ?? false;
		this.deadzone = params.deadzone ?? 0.1;
		this.decay = params.decay ?? false;
		this.decaySpeed = params.decaySpeed ?? 0.2;
		this.clamp = params.clamp ?? true;
		this.passThrough = params.passThrough ?? true;

		// Current stick positions (potentially unbounded if clamp=false)
		this.leftStick = { x: 0, y: 0 };
		this.rightStick = { x: 0, y: 0 };

		// Mouse capture state
		this.isCapturing = false;
		this.pointerLocked = false;

		// Track movement
		this.lastMouseTime = 0;
		this.mouseStillTime = 0;

		// Button actions
		this.leftClickAction = params.leftClickAction ?? 'none';
		this.leftClickButton = params.leftClickButton ?? 'buttonA';
		this.rightClickAction = params.rightClickAction ?? 'none';
		this.rightClickButton = params.rightClickButton ?? 'buttonA';
		this._activeButtons = new Set();

		// UI elements
		this._captureButton = null;
		this._targetSelect = null;
		this._sensitivityInput = null;
		this._deadzoneInput = null;
		this._decaySpeedInput = null;
		this._invertXCheckbox = null;
		this._invertYCheckbox = null;
		this._decayCheckbox = null;
		this._clampCheckbox = null;
		this._passThroughCheckbox = null;
		this._statusDisplay = null;
		this._stickDisplay = null;
		this._leftClickActionSelect = null;
		this._leftClickButtonSelect = null;
		this._rightClickActionSelect = null;
		this._rightClickButtonSelect = null;

		// Event handlers (bound for proper removal)
		this._mouseMoveHandler = this._onMouseMove.bind(this);
		this._pointerLockChangeHandler = this._onPointerLockChange.bind(this);
		this._pointerLockErrorHandler = this._onPointerLockError.bind(this);
		this._mouseDownHandler = this._onMouseDown.bind(this);
		this._mouseUpHandler = this._onMouseUp.bind(this);

		// Register mouse to stick specific actions
		this._registerMouseControlActions();
	}

	/**
	 * Register actions specific to the mouse to stick manipulator
	 */
	_registerMouseControlActions() {
		this.registerAction({
			name: 'startCapture',
			displayName: 'Start Mouse Capture',
			description: 'Start capturing mouse movement for stick control',
			handler: () => this.startCapture()
		});

		this.registerAction({
			name: 'stopCapture',
			displayName: 'Stop Mouse Capture',
			description: 'Stop capturing mouse movement',
			handler: () => this.stopCapture()
		});

		this.registerAction({
			name: 'toggleCapture',
			displayName: 'Toggle Mouse Capture',
			description: 'Toggle mouse capture on/off',
			handler: () => this.toggleCapture()
		});

		this.registerAction({
			name: 'resetSticks',
			displayName: 'Reset Sticks',
			description: 'Reset stick positions to center',
			handler: () => this.resetSticks()
		});

		this.registerAction({
			name: 'setTarget',
			displayName: 'Set Target Stick',
			description: 'Set which stick(s) to control',
			parameters: [
				{
					name: 'target',
					type: 'string',
					description: 'Target stick: left, right, or both',
					required: true,
					default: 'right'
				}
			],
			handler: (params) => this.setTarget(params.target)
		});

		this.registerAction({
			name: 'setSensitivity',
			displayName: 'Set Sensitivity',
			description: 'Set mouse sensitivity',
			parameters: [
				{
					name: 'sensitivity',
					type: 'number',
					description: 'Sensitivity multiplier (0.1-5.0)',
					required: true,
					default: 1.0
				}
			],
			handler: (params) => this.setSensitivity(params.sensitivity)
		});

		this.registerAction({
			name: 'setDeadzone',
			displayName: 'Set Deadzone',
			description: 'Set stick deadzone',
			parameters: [
				{
					name: 'deadzone',
					type: 'number',
					description: 'Deadzone radius (0-0.5)',
					required: true,
					default: 0.1
				}
			],
			handler: (params) => this.setDeadzone(params.deadzone)
		});

		this.registerAction({
			name: 'setDecay',
			displayName: 'Set Decay',
			description: 'Enable/disable decay to center',
			parameters: [
				{
					name: 'decay',
					type: 'boolean',
					description: 'Enable decay to center',
					required: true,
					default: false
				}
			],
			handler: (params) => this.setDecay(params.decay)
		});

		this.registerAction({
			name: 'setClamp',
			displayName: 'Set Clamp',
			description: 'Enable/disable clamping virtual stick position',
			parameters: [
				{
					name: 'clamp',
					type: 'boolean',
					description: 'Clamp virtual stick to [-1,1] range',
					required: true,
					default: true
				}
			],
			handler: (params) => this.setClamp(params.clamp)
		});

		this.registerAction({
			name: 'getStickPositions',
			displayName: 'Get Stick Positions',
			description: 'Get current stick positions',
			handler: () => this.getStickPositions()
		});

		this.registerAction({
			name: 'setStickPosition',
			displayName: 'Set Stick Position',
			description: 'Manually set stick position',
			parameters: [
				{ name: 'stick', type: 'string', description: 'Stick to control: left or right', required: true },
				{ name: 'x', type: 'number', description: 'X position', required: true },
				{ name: 'y', type: 'number', description: 'Y position', required: true }
			],
			handler: (params) => this.setStickPosition(params.stick, params.x, params.y)
		});

		// Add these at the end of the existing action registrations
		this.registerAction({
			name: 'setLeftClickAction',
			displayName: 'Set Left Click Action',
			description: 'Set action for left mouse button',
			parameters: [
				{
					name: 'action',
					type: 'string',
					description: 'Action: none, reset, or button',
					required: true,
					default: 'none'
				},
				{
					name: 'button',
					type: 'string',
					description: 'Button to press if action is button',
					required: false,
					default: 'buttonA'
				}
			],
			handler: (params) => this.setLeftClickAction(params.action, params.button)
		});

		this.registerAction({
			name: 'setRightClickAction',
			displayName: 'Set Right Click Action',
			description: 'Set action for right mouse button',
			parameters: [
				{
					name: 'action',
					type: 'string',
					description: 'Action: none, reset, or button',
					required: true,
					default: 'none'
				},
				{
					name: 'button',
					type: 'string',
					description: 'Button to press if action is button',
					required: false,
					default: 'buttonA'
				}
			],
			handler: (params) => this.setRightClickAction(params.action, params.button)
		});

	}

	/**
	 * Start capturing mouse movement
	 */
	startCapture() {
		if (this.isCapturing) {
			return false;
		}

		// Request pointer lock on the document body
		if (document.body.requestPointerLock) {
			document.body.requestPointerLock();
		} else {
			this.log('Pointer lock not supported');
			return false;
		}

		this.isCapturing = true;
		this.lastMouseTime = performance.now();
		this._updateUI();
		this.log('Mouse capture started');
		return true;
	}

	/**
	 * Stop capturing mouse movement
	 */
	stopCapture() {
		if (!this.isCapturing) {
			return false;
		}

		if (document.exitPointerLock) {
			document.exitPointerLock();
		}

		this.isCapturing = false;

		// Always reset sticks when capture stops
		this.resetSticks();
		// Clear any active buttons
		this._activeButtons.clear();

		this._updateUI();
		this.log('Mouse capture stopped');
		return true;
	}

	/**
	 * Toggle mouse capture
	 */
	toggleCapture() {
		if (this.isCapturing) {
			return this.stopCapture();
		} else {
			return this.startCapture();
		}
	}

	/**
	 * Reset stick positions to center
	 */
	resetSticks() {
		this.leftStick = { x: 0, y: 0 };
		this.rightStick = { x: 0, y: 0 };
		this._updateStickDisplay();
		this.log('Stick positions reset');
		return true;
	}

	/**
	 * Set target stick(s)
	 * @param {string} target
	 */
	setTarget(target) {
		const validTargets = ['left', 'right', 'both'];
		if (!validTargets.includes(target)) {
			this.log(`Invalid target: ${target}. Must be one of: ${validTargets.join(', ')}`);
			return false;
		}

		this.target = target;
		if (this._targetSelect) {
			this._targetSelect.value = target;
		}
		this.log(`Target set to ${target} stick(s)`);
		return target;
	}

	/**
	 * Set mouse sensitivity
	 * @param {number} sensitivity
	 */
	setSensitivity(sensitivity) {
		const newSensitivity = Math.max(0.1, Math.min(5.0, sensitivity));
		this.sensitivity = newSensitivity;
		if (this._sensitivityInput) {
			this._sensitivityInput.value = newSensitivity;
		}
		this.log(`Sensitivity set to ${newSensitivity}`);
		return newSensitivity;
	}

	/**
	 * Set deadzone
	 * @param {number} deadzone
	 */
	setDeadzone(deadzone) {
		const newDeadzone = Math.max(0, Math.min(0.5, deadzone));
		this.deadzone = newDeadzone;
		if (this._deadzoneInput) {
			this._deadzoneInput.value = newDeadzone;
		}
		this.log(`Deadzone set to ${newDeadzone}`);
		return newDeadzone;
	}

	/**
	 * Set decay mode
	 * @param {boolean} decay
	 */
	setDecay(decay) {
		this.decay = Boolean(decay);
		if (this._decayCheckbox) {
			this._decayCheckbox.checked = this.decay;
		}
		this.log(`Decay ${this.decay ? 'enabled' : 'disabled'}`);
		return this.decay;
	}

	/**
	 * Set clamp mode
	 * @param {boolean} clamp
	 */
	setClamp(clamp) {
		this.clamp = Boolean(clamp);
		if (this._clampCheckbox) {
			this._clampCheckbox.checked = this.clamp;
		}
		this.log(`Clamp ${this.clamp ? 'enabled' : 'disabled'}`);
		return this.clamp;
	}

	/**
	 * Get current stick positions
	 * @returns {Object} Current stick positions
	 */
	getStickPositions() {
		return {
			left: { ...this.leftStick },
			right: { ...this.rightStick }
		};
	}

	/**
	 * Set stick position manually
	 * @param {string} stick - 'left' or 'right'
	 * @param {number} x - X position
	 * @param {number} y - Y position
	 */
	setStickPosition(stick, x, y) {
		if (stick === 'left') {
			this.leftStick.x = x;
			this.leftStick.y = y;
		} else if (stick === 'right') {
			this.rightStick.x = x;
			this.rightStick.y = y;
		} else {
			this.log(`Invalid stick: ${stick}. Must be 'left' or 'right'`);
			return false;
		}

		this._updateStickDisplay();
		this.log(`${stick} stick set to (${x.toFixed(2)}, ${y.toFixed(2)})`);
		return { x, y };
	}

	/**
	 * Handle mouse movement events
	 * @private
	 */
	_onMouseMove(event) {
		if (!this.isCapturing || !this.pointerLocked || !this.enabled) {
			return;
		}

		const currentTime = performance.now();
		this.lastMouseTime = currentTime;
		this.mouseStillTime = 0;

		// Get mouse movement deltas
		const deltaX = event.movementX || 0;
		const deltaY = event.movementY || 0;

		// Apply sensitivity and inversion
		let moveX = deltaX * this.sensitivity * 0.01;
		let moveY = deltaY * this.sensitivity * 0.01;

		if (this.invertX) moveX = -moveX;
		if (this.invertY) moveY = -moveY;

		// Update stick positions based on target
		if (this.target === 'left' || this.target === 'both') {
			this.leftStick.x += moveX;
			this.leftStick.y += moveY;
		}
		if (this.target === 'right' || this.target === 'both') {
			this.rightStick.x += moveX;
			this.rightStick.y += moveY;
		}

		// Apply clamping if enabled
		if (this.clamp) {
			this.rightStick.x = Math.max(-1, Math.min(1, this.rightStick.x));
			this.rightStick.y = Math.max(-1, Math.min(1, this.rightStick.y));
			this.leftStick.x = Math.max(-1, Math.min(1, this.leftStick.x));
			this.leftStick.y = Math.max(-1, Math.min(1, this.leftStick.y));
		}

		this._updateStickDisplay();
	}

	/**
	 * Apply deadzone to stick input
	 * @private
	 */
	_applyDeadzone(x, y) {
		const magnitude = Math.sqrt(x * x + y * y);
		if (magnitude < this.deadzone) {
			return { x: 0, y: 0 };
		}

		// Scale to account for deadzone
		const scaledMagnitude = (magnitude - this.deadzone) / (1 - this.deadzone);
		const scale = scaledMagnitude / magnitude;
		return {
			x: x * scale,
			y: y * scale
		};
	}

	/**
	 * Handle decay in relative mode
	 * @private
	 */
	_updateDecay(deltaTime) {
		if (!this.decay) {
			return;
		}

		const currentTime = performance.now();
		if (currentTime - this.lastMouseTime > 200) { // 200ms of no movement
			const decayFactor = this.decaySpeed * (deltaTime / 16.67); // Normalize to 60fps

			this.leftStick.x *= (1 - decayFactor);
			this.leftStick.y *= (1 - decayFactor);
			this.rightStick.x *= (1 - decayFactor);
			this.rightStick.y *= (1 - decayFactor);

			// Snap to zero if very close
			if (Math.abs(this.leftStick.x) < 0.01) this.leftStick.x = 0;
			if (Math.abs(this.leftStick.y) < 0.01) this.leftStick.y = 0;
			if (Math.abs(this.rightStick.x) < 0.01) this.rightStick.x = 0;
			if (Math.abs(this.rightStick.y) < 0.01) this.rightStick.y = 0;
		}
	}

	/**
	 * Handle pointer lock change events
	 * @private
	 */
	_onPointerLockChange() {
		this.pointerLocked = document.pointerLockElement === document.body;

		if (!this.pointerLocked && this.isCapturing) {
			this.stopCapture();
			this.log('Pointer lock lost, stopping capture');
		}

		this._updateUI();
	}

	/**
	 * Handle pointer lock error events
	 * @private
	 */
	_onPointerLockError() {
		this.log('Pointer lock failed');
		this.isCapturing = false;
		this.pointerLocked = false;
		this._updateUI();
	}

	/**
	 * Set left click action
	 * @param {string} action - 'none', 'reset', or 'button'
	 * @param {string} button - Button name if action is 'button'
	 */
	setLeftClickAction(action, button = 'buttonA') {
		const validActions = ['none', 'reset', 'button'];
		if (!validActions.includes(action)) {
			this.log(`Invalid left click action: ${action}. Must be one of: ${validActions.join(', ')}`);
			return false;
		}

		this.leftClickAction = action;
		if (action === 'button') {
			this.leftClickButton = button;
		}

		if (this._leftClickActionSelect) {
			this._leftClickActionSelect.value = action;
		}
		if (this._leftClickButtonSelect) {
			this._leftClickButtonSelect.value = this.leftClickButton;
		}

		this.log(`Left click action set to ${action}${action === 'button' ? ` (${button})` : ''}`);
		return { action, button: this.leftClickButton };
	}

	/**
	 * Set right click action
	 * @param {string} action - 'none', 'reset', or 'button'
	 * @param {string} button - Button name if action is 'button'
	 */
	setRightClickAction(action, button = 'buttonA') {
		const validActions = ['none', 'reset', 'button'];
		if (!validActions.includes(action)) {
			this.log(`Invalid right click action: ${action}. Must be one of: ${validActions.join(', ')}`);
			return false;
		}

		this.rightClickAction = action;
		if (action === 'button') {
			this.rightClickButton = button;
		}

		if (this._rightClickActionSelect) {
			this._rightClickActionSelect.value = action;
		}
		if (this._rightClickButtonSelect) {
			this._rightClickButtonSelect.value = this.rightClickButton;
		}

		this.log(`Right click action set to ${action}${action === 'button' ? ` (${button})` : ''}`);
		return { action, button: this.rightClickButton };
	}

	/**
	 * Handle mouse down events
	 * @private
	 */
	_onMouseDown(event) {
		if (!this.isCapturing || !this.pointerLocked || !this.enabled) {
			return;
		}

		event.preventDefault();

		if (event.button === 0) { // Left mouse button
			this._handleClickAction(this.leftClickAction, this.leftClickButton, 'Left');
		} else if (event.button === 2) { // Right mouse button
			this._handleClickAction(this.rightClickAction, this.rightClickButton, 'Right');
		}
	}

	/**
	 * Handle mouse up events
	 * @private
	 */
	_onMouseUp(event) {
		if (!this.isCapturing || !this.pointerLocked || !this.enabled) {
			return;
		}

		event.preventDefault();

		// Release button states if they were pressed
		if (event.button === 0 && this.leftClickAction === 'button') {
			this._releaseButton(this.leftClickButton);
		} else if (event.button === 2 && this.rightClickAction === 'button') {
			this._releaseButton(this.rightClickButton);
		}
	}

	/**
	 * Handle click action execution
	 * @private
	 */
	_handleClickAction(action, button, mouseButton) {
		switch (action) {
			case 'reset':
				this.resetSticks();
				this.log(`${mouseButton} click: Reset sticks`);
				break;
			case 'button':
				this._pressButton(button);
				this.log(`${mouseButton} click: Press ${button}`);
				break;
			case 'none':
			default:
				// Do nothing
				break;
		}
	}

	/**
	 * Press a controller button
	 * @private
	 */
	_pressButton(buttonName) {
		this._activeButtons.add(buttonName);
	}

	/**
	 * Release a controller button
	 * @private
	 */
	_releaseButton(buttonName) {
		this._activeButtons.delete(buttonName);
	}

	/**
	 * Update UI elements to reflect current state
	 * @private
	 */
	_updateUI() {
		if (this._captureButton) {
			this._captureButton.textContent = this.isCapturing ? 'Stop Capture' : 'Start Capture';
			this._captureButton.className = this.isCapturing ? 'button small active' : 'button small';
		}

		if (this._statusDisplay) {
			const status = this.pointerLocked ? 'Capturing' : (this.isCapturing ? 'Waiting...' : 'Inactive');
			this._statusDisplay.textContent = `Status: ${status}`;
			this._statusDisplay.className = `mouseControl-status ${this.pointerLocked ? 'active' : ''}`;
		}
	}

	/**
	 * Update stick position display
	 * @private
	 */
	_updateStickDisplay() {
		if (this._stickDisplay) {
			const leftStr = `L(${this.leftStick.x.toFixed(2)}, ${this.leftStick.y.toFixed(2)})`;
			const rightStr = `R(${this.rightStick.x.toFixed(2)}, ${this.rightStick.y.toFixed(2)})`;
			const clampStr = this.clamp ? 'Clamped' : 'Unbounded';
			this._stickDisplay.textContent = `${leftStr} ${rightStr} [${clampStr}]`;
		}
	}

	_processInternal(state, deltaTime) {
		// Handle decay
		this._updateDecay(deltaTime);

		// Get current stick values with deadzone applied
		const leftWithDeadzone = this._applyDeadzone(this.leftStick.x, this.leftStick.y);
		const rightWithDeadzone = this._applyDeadzone(this.rightStick.x, this.rightStick.y);

		// Apply to controller state (always clamp controller output to [-1,1])
		if (this.target === 'left' || this.target === 'both') {
			if (this.passThrough) {
				state.analog.leftX += leftWithDeadzone.x;
				state.analog.leftY += leftWithDeadzone.y;
				// Clamp controller output to valid range
				state.analog.leftX = Math.max(-1, Math.min(1, state.analog.leftX));
				state.analog.leftY = Math.max(-1, Math.min(1, state.analog.leftY));
			} else {
				state.analog.leftX = Math.max(-1, Math.min(1, leftWithDeadzone.x));
				state.analog.leftY = Math.max(-1, Math.min(1, leftWithDeadzone.y));
			}
		}

		if (this.target === 'right' || this.target === 'both') {
			if (this.passThrough) {
				state.analog.rightX += rightWithDeadzone.x;
				state.analog.rightY += rightWithDeadzone.y;
				// Clamp controller output to valid range
				state.analog.rightX = Math.max(-1, Math.min(1, state.analog.rightX));
				state.analog.rightY = Math.max(-1, Math.min(1, state.analog.rightY));
			} else {
				state.analog.rightX = Math.max(-1, Math.min(1, rightWithDeadzone.x));
				state.analog.rightY = Math.max(-1, Math.min(1, rightWithDeadzone.y));
			}
		}

		// Update stick display
		this._updateStickDisplay();

		// Apply currently active buttons
		for (const buttonName of this._activeButtons) {
			if (state.digital.hasOwnProperty(buttonName)) {
				state.digital[buttonName] = true;
			}
		}

		return state;
	}

	createControls() {
		const container = document.createElement('div');
		container.className = 'manipulator-controls mouseControl-custom';

		// Capture control section
		const captureDiv = document.createElement('div');
		captureDiv.className = 'manipulator-control-group inline-with-gap';

		this._captureButton = document.createElement('button');
		this._captureButton.textContent = 'Start Capture';
		this._captureButton.className = 'button small';
		this._captureButton.addEventListener('click', () => {
			this.executeAction('toggleCapture');
		});

		const resetButton = document.createElement('button');
		resetButton.textContent = 'Reset Sticks';
		resetButton.className = 'button small';
		resetButton.addEventListener('click', () => {
			this.executeAction('resetSticks');
		});

		this._statusDisplay = document.createElement('div');
		this._statusDisplay.textContent = 'Status: Inactive';
		this._statusDisplay.className = 'mouseControl-status';

		captureDiv.appendChild(this._captureButton);
		captureDiv.appendChild(resetButton);
		captureDiv.appendChild(this._statusDisplay);

		// Stick display
		const stickDiv = document.createElement('div');
		stickDiv.className = 'manipulator-control-group';

		this._stickDisplay = document.createElement('div');
		this._stickDisplay.className = 'mouseControl-stick-display';
		this._stickDisplay.textContent = 'L(0.00, 0.00) R(0.00, 0.00) [Clamped]';

		stickDiv.appendChild(this._stickDisplay);

		// Target selection
		const targetDiv = document.createElement('div');
		targetDiv.className = 'inline-with-gap';

		const targetLabel = document.createElement('label');
		targetLabel.textContent = 'Target:';

		this._targetSelect = document.createElement('select');
		this._targetSelect.innerHTML = `
			<option value="left">Left Stick</option>
			<option value="right">Right Stick</option>
			<option value="both">Both Sticks</option>
		`;
		this._targetSelect.value = this.target;
		this._targetSelect.addEventListener('change', () => {
			this.executeAction('setTarget', { target: this._targetSelect.value });
		});

		targetDiv.appendChild(targetLabel);
		targetDiv.appendChild(this._targetSelect);

		// Sensitivity control
		const sensitivityDiv = document.createElement('div');
		sensitivityDiv.className = 'inline-with-gap';

		const sensitivityLabel = document.createElement('label');
		sensitivityLabel.textContent = 'Sensitivity:';

		this._sensitivityInput = document.createElement('input');
		this._sensitivityInput.type = 'range';
		this._sensitivityInput.min = '0.1';
		this._sensitivityInput.max = '3.0';
		this._sensitivityInput.step = '0.1';
		this._sensitivityInput.value = this.sensitivity;

		const sensitivityValue = document.createElement('span');
		sensitivityValue.textContent = this.sensitivity.toFixed(1);
		sensitivityValue.className = 'mouseControl-value-display';

		this._sensitivityInput.addEventListener('input', () => {
			const newSensitivity = parseFloat(this._sensitivityInput.value);
			sensitivityValue.textContent = newSensitivity.toFixed(1);
			this.executeAction('setSensitivity', { sensitivity: newSensitivity });
		});

		sensitivityDiv.appendChild(sensitivityLabel);
		sensitivityDiv.appendChild(this._sensitivityInput);
		sensitivityDiv.appendChild(sensitivityValue);

		// Deadzone control
		const deadzoneDiv = document.createElement('div');
		deadzoneDiv.className = 'inline-with-gap';

		const deadzoneLabel = document.createElement('label');
		deadzoneLabel.textContent = 'Deadzone:';

		this._deadzoneInput = document.createElement('input');
		this._deadzoneInput.type = 'range';
		this._deadzoneInput.min = '0';
		this._deadzoneInput.max = '0.5';
		this._deadzoneInput.step = '0.05';
		this._deadzoneInput.value = this.deadzone;

		const deadzoneValue = document.createElement('span');
		deadzoneValue.textContent = this.deadzone.toFixed(2);
		deadzoneValue.className = 'mouseControl-value-display';

		this._deadzoneInput.addEventListener('input', () => {
			const newDeadzone = parseFloat(this._deadzoneInput.value);
			deadzoneValue.textContent = newDeadzone.toFixed(2);
			this.executeAction('setDeadzone', { deadzone: newDeadzone });
		});

		deadzoneDiv.appendChild(deadzoneLabel);
		deadzoneDiv.appendChild(this._deadzoneInput);
		deadzoneDiv.appendChild(deadzoneValue);

		// Decay speed control (only when decay is enabled)
		const decaySpeedDiv = document.createElement('div');
		decaySpeedDiv.className = 'inline-with-gap mouseControl-decay-only';

		const decaySpeedLabel = document.createElement('label');
		decaySpeedLabel.textContent = 'Decay Speed:';

		this._decaySpeedInput = document.createElement('input');
		this._decaySpeedInput.type = 'range';
		this._decaySpeedInput.min = '0';
		this._decaySpeedInput.max = '1';
		this._decaySpeedInput.step = '0.05';
		this._decaySpeedInput.value = this.decaySpeed;

		const decaySpeedValue = document.createElement('span');
		decaySpeedValue.textContent = this.decaySpeed.toFixed(2);
		decaySpeedValue.className = 'mouseControl-value-display';

		this._decaySpeedInput.addEventListener('input', () => {
			const newDecaySpeed = parseFloat(this._decaySpeedInput.value);
			decaySpeedValue.textContent = newDecaySpeed.toFixed(2);
			this.decaySpeed = newDecaySpeed;
		});

		decaySpeedDiv.appendChild(decaySpeedLabel);
		decaySpeedDiv.appendChild(this._decaySpeedInput);
		decaySpeedDiv.appendChild(decaySpeedValue);

		// Additional options
		const optionsDiv = document.createElement('div');
		optionsDiv.className = 'manipulator-control-group';

		const invertXLabel = document.createElement('label');
		invertXLabel.className = 'manipulator-label';
		this._invertXCheckbox = document.createElement('input');
		this._invertXCheckbox.type = 'checkbox';
		this._invertXCheckbox.checked = this.invertX;
		this._invertXCheckbox.addEventListener('change', () => {
			this.invertX = this._invertXCheckbox.checked;
			this.log(`X-axis inversion ${this.invertX ? 'enabled' : 'disabled'}`);
		});
		const invertXText = document.createElement('span');
		invertXText.textContent = 'Invert X-axis';
		invertXLabel.appendChild(this._invertXCheckbox);
		invertXLabel.appendChild(invertXText);

		const invertYLabel = document.createElement('label');
		invertYLabel.className = 'manipulator-label';
		this._invertYCheckbox = document.createElement('input');
		this._invertYCheckbox.type = 'checkbox';
		this._invertYCheckbox.checked = this.invertY;
		this._invertYCheckbox.addEventListener('change', () => {
			this.invertY = this._invertYCheckbox.checked;
			this.log(`Y-axis inversion ${this.invertY ? 'enabled' : 'disabled'}`);
		});
		const invertYText = document.createElement('span');
		invertYText.textContent = 'Invert Y-axis';
		invertYLabel.appendChild(this._invertYCheckbox);
		invertYLabel.appendChild(invertYText);

		const decayLabel = document.createElement('label');
		decayLabel.className = 'manipulator-label';
		this._decayCheckbox = document.createElement('input');
		this._decayCheckbox.type = 'checkbox';
		this._decayCheckbox.checked = this.decay;
		this._decayCheckbox.addEventListener('change', () => {
			this.executeAction('setDecay', { decay: this._decayCheckbox.checked });
		});
		const decayText = document.createElement('span');
		decayText.textContent = 'Auto-decay to center when idle';
		decayLabel.appendChild(this._decayCheckbox);
		decayLabel.appendChild(decayText);

		const clampLabel = document.createElement('label');
		clampLabel.className = 'manipulator-label';
		this._clampCheckbox = document.createElement('input');
		this._clampCheckbox.type = 'checkbox';
		this._clampCheckbox.checked = this.clamp;
		this._clampCheckbox.addEventListener('change', () => {
			this.executeAction('setClamp', { clamp: this._clampCheckbox.checked });
		});
		const clampText = document.createElement('span');
		clampText.textContent = 'Clamp virtual stick to [-1,1] range';
		clampLabel.appendChild(this._clampCheckbox);
		clampLabel.appendChild(clampText);

		const passThroughLabel = document.createElement('label');
		passThroughLabel.className = 'manipulator-label';
		this._passThroughCheckbox = document.createElement('input');
		this._passThroughCheckbox.type = 'checkbox';
		this._passThroughCheckbox.checked = this.passThrough;
		this._passThroughCheckbox.addEventListener('change', () => {
			this.passThrough = this._passThroughCheckbox.checked;
			this.log(`Pass-through ${this.passThrough ? 'enabled' : 'disabled'}`);
		});
		const passThroughText = document.createElement('span');
		passThroughText.textContent = 'Also pass real sticks';
		passThroughLabel.appendChild(this._passThroughCheckbox);
		passThroughLabel.appendChild(passThroughText);

		optionsDiv.appendChild(invertXLabel);
		optionsDiv.appendChild(invertYLabel);
		optionsDiv.appendChild(decayLabel);
		optionsDiv.appendChild(clampLabel);
		optionsDiv.appendChild(passThroughLabel);

		// Help text
		const helpDiv = document.createElement('div');
		helpDiv.className = 'help-box';
		helpDiv.innerHTML = `
			<strong>Usage:</strong> Click "Start Capture" to capture the mouse cursor.<br>
			Press Esc to exit capture mode.
		`;

		// Function to update decay-only controls visibility
		const updateDecayControls = () => {
			const decayOnlyElements = container.querySelectorAll('.mouseControl-decay-only');
			decayOnlyElements.forEach(element => {
				element.style.display = this.decay ? 'flex' : 'none';
			});
		};

		// Update on decay change
		this._decayCheckbox.addEventListener('change', updateDecayControls);

		// Mouse click actions
		const clickActionsDiv = document.createElement('div');
		clickActionsDiv.className = 'manipulator-control-group';

		const clickActionsTitle = document.createElement('div');
		clickActionsTitle.textContent = 'Mouse Click Actions';
		clickActionsTitle.style.fontWeight = 'bold';
		clickActionsTitle.style.marginBottom = '8px';

		// Left click action
		const leftClickDiv = document.createElement('div');
		leftClickDiv.className = 'inline-with-gap';

		const leftClickLabel = document.createElement('label');
		leftClickLabel.textContent = 'Left Click:';

		this._leftClickActionSelect = document.createElement('select');
		this._leftClickActionSelect.innerHTML = `
    <option value="none">None</option>
    <option value="reset">Reset Sticks</option>
    <option value="button">Press Button</option>
`;
		this._leftClickActionSelect.value = this.leftClickAction;

		this._leftClickButtonSelect = document.createElement('select');
		this._leftClickButtonSelect.innerHTML = `
    <option value="buttonA">A</option>
    <option value="buttonB">B</option>
    <option value="buttonX">X</option>
    <option value="buttonY">Y</option>
    <option value="buttonL">L</option>
    <option value="buttonR">R</option>
    <option value="buttonZL">ZL</option>
    <option value="buttonZR">ZR</option>
    <option value="buttonPlus">Plus</option>
    <option value="buttonMinus">Minus</option>
    <option value="buttonHome">Home</option>
    <option value="buttonCapture">Capture</option>
`;
		this._leftClickButtonSelect.value = this.leftClickButton;
		this._leftClickButtonSelect.style.display = this.leftClickAction === 'button' ? 'block' : 'none';

		this._leftClickActionSelect.addEventListener('change', () => {
			const action = this._leftClickActionSelect.value;
			this._leftClickButtonSelect.style.display = action === 'button' ? 'block' : 'none';
			this.executeAction('setLeftClickAction', {
				action: action,
				button: this._leftClickButtonSelect.value
			});
		});

		this._leftClickButtonSelect.addEventListener('change', () => {
			this.executeAction('setLeftClickAction', {
				action: this._leftClickActionSelect.value,
				button: this._leftClickButtonSelect.value
			});
		});

		leftClickDiv.appendChild(leftClickLabel);
		leftClickDiv.appendChild(this._leftClickActionSelect);
		leftClickDiv.appendChild(this._leftClickButtonSelect);

		// Right click action
		const rightClickDiv = document.createElement('div');
		rightClickDiv.className = 'inline-with-gap';

		const rightClickLabel = document.createElement('label');
		rightClickLabel.textContent = 'Right Click:';

		this._rightClickActionSelect = document.createElement('select');
		this._rightClickActionSelect.innerHTML = `
    <option value="none">None</option>
    <option value="reset">Reset Sticks</option>
    <option value="button">Press Button</option>
`;
		this._rightClickActionSelect.value = this.rightClickAction;

		this._rightClickButtonSelect = document.createElement('select');
		this._rightClickButtonSelect.innerHTML = `
    <option value="buttonA">A</option>
    <option value="buttonB">B</option>
    <option value="buttonX">X</option>
    <option value="buttonY">Y</option>
    <option value="buttonL">L</option>
    <option value="buttonR">R</option>
    <option value="buttonZL">ZL</option>
    <option value="buttonZR">ZR</option>
    <option value="buttonPlus">Plus</option>
    <option value="buttonMinus">Minus</option>
    <option value="buttonHome">Home</option>
    <option value="buttonCapture">Capture</option>
`;
		this._rightClickButtonSelect.value = this.rightClickButton;
		this._rightClickButtonSelect.style.display = this.rightClickAction === 'button' ? 'block' : 'none';

		this._rightClickActionSelect.addEventListener('change', () => {
			const action = this._rightClickActionSelect.value;
			this._rightClickButtonSelect.style.display = action === 'button' ? 'block' : 'none';
			this.executeAction('setRightClickAction', {
				action: action,
				button: this._rightClickButtonSelect.value
			});
		});

		this._rightClickButtonSelect.addEventListener('change', () => {
			this.executeAction('setRightClickAction', {
				action: this._rightClickActionSelect.value,
				button: this._rightClickButtonSelect.value
			});
		});

		rightClickDiv.appendChild(rightClickLabel);
		rightClickDiv.appendChild(this._rightClickActionSelect);
		rightClickDiv.appendChild(this._rightClickButtonSelect);

		clickActionsDiv.appendChild(clickActionsTitle);
		clickActionsDiv.appendChild(leftClickDiv);
		clickActionsDiv.appendChild(rightClickDiv);

		// Assemble the UI
		container.appendChild(captureDiv);
		container.appendChild(stickDiv);
		container.appendChild(targetDiv);
		container.appendChild(sensitivityDiv);
		container.appendChild(deadzoneDiv);
		container.appendChild(decaySpeedDiv);
		container.appendChild(optionsDiv);
		container.appendChild(clickActionsDiv);
		container.appendChild(helpDiv);

		// Add custom styles
		const style = document.createElement('style');
		style.textContent = `
			.mouseControl-custom .mouseControl-value-display {
				margin-left: 8px;
				font-weight: bold;
				min-width: 40px;
				display: inline-block;
			}
			
			.mouseControl-custom input[type="range"] {
				flex: 1;
				margin: 0 8px;
			}
			
			.mouseControl-custom select {
				margin-left: 8px;
				flex: 1;
			}
						
			.mouseControl-custom label {
				min-width: 120px;
			}
			
			.mouseControl-custom .mouseControl-status.active {
				background: #d4edda0f;
				color: #6fff90ff;
			}
			
			.mouseControl-custom .mouseControl-stick-display {
				margin-top: 8px;
				padding: 6px 8px;
				background: #e3f2fd;
				border-radius: 4px;
				font-family: monospace;
				font-size: 0.85em;
				color: #1565c0;
				text-align: center;
			}
			
			.mouseControl-custom .button.active {
				background: #28a745;
				color: white;
			}
			
			.mouseControl-custom .inline-with-gap {
				display: flex;
				align-items: center;
				gap: 8px;
				margin-bottom: 8px;
			}
		`;
		container.appendChild(style);

		// Initialize UI state
		this._updateUI();
		this._updateStickDisplay();
		updateDecayControls();

		return container;
	}

	_getSpecificConfig() {
		return {
			target: this.target,
			sensitivity: this.sensitivity,
			invertX: this.invertX,
			invertY: this.invertY,
			deadzone: this.deadzone,
			decay: this.decay,
			decaySpeed: this.decaySpeed,
			clamp: this.clamp,
			passThrough: this.passThrough,
			leftClickAction: this.leftClickAction,
			leftClickButton: this.leftClickButton,
			rightClickAction: this.rightClickAction,
			rightClickButton: this.rightClickButton
		};
	}

	_setSpecificConfig(config) {
		if (config.target !== undefined) {
			this.setTarget(config.target);
		}
		if (config.sensitivity !== undefined) {
			this.setSensitivity(config.sensitivity);
		}
		if (config.invertX !== undefined) {
			this.invertX = config.invertX;
			if (this._invertXCheckbox) {
				this._invertXCheckbox.checked = this.invertX;
			}
		}
		if (config.invertY !== undefined) {
			this.invertY = config.invertY;
			if (this._invertYCheckbox) {
				this._invertYCheckbox.checked = this.invertY;
			}
		}
		if (config.deadzone !== undefined) {
			this.setDeadzone(config.deadzone);
		}
		if (config.decay !== undefined) {
			this.setDecay(config.decay);
		}
		if (config.decaySpeed !== undefined) {
			this.decaySpeed = config.decaySpeed;
			if (this._decaySpeedInput) {
				this._decaySpeedInput.value = this.decaySpeed;
				// Update display
				const decaySpeedValue = this._decaySpeedInput.parentNode.querySelector('.mouseControl-value-display');
				if (decaySpeedValue) {
					decaySpeedValue.textContent = this.decaySpeed.toFixed(2);
				}
			}
		}
		if (config.clamp !== undefined) {
			this.setClamp(config.clamp);
		}
		if (config.passThrough !== undefined) {
			this.passThrough = config.passThrough;
			if (this._passThroughCheckbox) {
				this._passThroughCheckbox.checked = this.passThrough;
			}
		}
		if (config.leftClickAction !== undefined) {
			this.setLeftClickAction(config.leftClickAction, config.leftClickButton);
		}
		if (config.rightClickAction !== undefined) {
			this.setRightClickAction(config.rightClickAction, config.rightClickButton);
		}
	}

	onAttach() {
		// Add event listeners for pointer lock
		document.addEventListener('pointerlockchange', this._pointerLockChangeHandler);
		document.addEventListener('pointerlockerror', this._pointerLockErrorHandler);
		document.addEventListener('mousemove', this._mouseMoveHandler);
		document.addEventListener('mousedown', this._mouseDownHandler);
		document.addEventListener('mouseup', this._mouseUpHandler);
	}

	onDetach() {
		// Stop capture and remove event listeners
		this.stopCapture();
		document.removeEventListener('pointerlockchange', this._pointerLockChangeHandler);
		document.removeEventListener('pointerlockerror', this._pointerLockErrorHandler);
		document.removeEventListener('mousemove', this._mouseMoveHandler);
		document.removeEventListener('mousedown', this._mouseDownHandler);
		document.removeEventListener('mouseup', this._mouseUpHandler);
	}

	onEnabledChanged(enabled) {
		if (!enabled) {
			// Stop capture when disabled
			this.stopCapture();
		}
	}

	dispose() {
		super.dispose();
		this.onDetach();
		this._captureButton = null;
		this._targetSelect = null;
		this._sensitivityInput = null;
		this._deadzoneInput = null;
		this._decaySpeedInput = null;
		this._invertXCheckbox = null;
		this._invertYCheckbox = null;
		this._decayCheckbox = null;
		this._clampCheckbox = null;
		this._passThroughCheckbox = null;
		this._statusDisplay = null;
		this._stickDisplay = null;
		this._leftClickActionSelect = null;
		this._leftClickButtonSelect = null;
		this._rightClickActionSelect = null;
		this._rightClickButtonSelect = null;
		this._activeButtons = null;
	}
}