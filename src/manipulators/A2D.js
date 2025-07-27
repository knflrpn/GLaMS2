/**
 * ./src/manipulators/A2D.js
 *
 * Manipulator that converts analog stick inputs to digital button presses.
 * Left stick -> D-Pad, Right stick -> ABXY
 */
import { BaseManipulator } from './BaseManipulator.js';

/**
 * @typedef {Object} A2DParams
 * @property {boolean} [enableLeft=true] - Enable left stick to D-Pad conversion
 * @property {boolean} [enableRight=true] - Enable right stick to ABXY conversion
 * @property {boolean} [passLeftAnalog=true] - Pass through left analog values
 * @property {boolean} [passRightAnalog=true] - Pass through right analog values
 * @property {number} [threshold=0.5] - Threshold for analog to digital conversion (0-1)
 */

export class A2D extends BaseManipulator {
	static get defaultConfig() {
		return {
			enableLeft: true,
			enableRight: true,
			passLeftAnalog: true,
			passRightAnalog: true,
			threshold: 0.5
		};
	}
	static get displayName() {
		return "Sticks to Buttons";
	}

	static get description() {
		return "Convert analog stick movement to that direction's digital button.";
	}

	/**
	 * @param {A2DParams} params - Configuration parameters
	 */
	constructor(params = {}) {
		super(params);

		this.enableLeft = params.enableLeft ?? true;
		this.enableRight = params.enableRight ?? true;
		this.passLeftAnalog = params.passLeftAnalog ?? true;
		this.passRightAnalog = params.passRightAnalog ?? true;
		this.threshold = params.threshold ?? 0.5;

		// UI elements
		this._leftCheckbox = null;
		this._rightCheckbox = null;
		this._passLeftCheckbox = null;
		this._passRightCheckbox = null;
		this._thresholdSlider = null;
		this._thresholdDisplay = null;

		// Register A2D-specific actions
		this._registerA2DActions();
	}

	/**
	 * Register actions specific to the A2D manipulator
	 */
	_registerA2DActions() {
		this.registerAction({
			name: 'setLeftEnabled',
			displayName: 'Enable Left Stick',
			description: 'Enable/disable left stick to D-Pad conversion',
			parameters: [
				{
					name: 'enabled',
					type: 'boolean',
					description: 'Enable left stick conversion',
					required: true
				}
			],
			handler: (params) => this.setLeftEnabled(params.enabled)
		});

		this.registerAction({
			name: 'setRightEnabled',
			displayName: 'Enable Right Stick',
			description: 'Enable/disable right stick to ABXY conversion',
			parameters: [
				{
					name: 'enabled',
					type: 'boolean',
					description: 'Enable right stick conversion',
					required: true
				}
			],
			handler: (params) => this.setRightEnabled(params.enabled)
		});

		this.registerAction({
			name: 'setPassLeftAnalog',
			displayName: 'Pass Left Analog',
			description: 'Enable/disable passing through left analog values',
			parameters: [
				{
					name: 'enabled',
					type: 'boolean',
					description: 'Pass through left analog',
					required: true
				}
			],
			handler: (params) => this.setPassLeftAnalog(params.enabled)
		});

		this.registerAction({
			name: 'setPassRightAnalog',
			displayName: 'Pass Right Analog',
			description: 'Enable/disable passing through right analog values',
			parameters: [
				{
					name: 'enabled',
					type: 'boolean',
					description: 'Pass through right analog',
					required: true
				}
			],
			handler: (params) => this.setPassRightAnalog(params.enabled)
		});

		this.registerAction({
			name: 'setThreshold',
			displayName: 'Set Threshold',
			description: 'Set the threshold for analog to digital conversion',
			parameters: [
				{
					name: 'threshold',
					type: 'number',
					description: 'Threshold value (0-1)',
					required: true,
					default: 0.5
				}
			],
			handler: (params) => this.setThreshold(params.threshold)
		});

		this.registerAction({
			name: 'toggleBoth',
			displayName: 'Toggle Both Sticks',
			description: 'Toggle both left and right stick conversions',
			handler: () => this.toggleBoth()
		});
	}

	/**
	 * Set left stick conversion enabled state
	 * @param {boolean} enabled
	 */
	setLeftEnabled(enabled) {
		this.enableLeft = enabled;
		if (this._leftCheckbox) {
			this._leftCheckbox.checked = enabled;
		}
		this.log(`Left stick conversion ${enabled ? 'enabled' : 'disabled'}`);
		return enabled;
	}

	/**
	 * Set right stick conversion enabled state
	 * @param {boolean} enabled
	 */
	setRightEnabled(enabled) {
		this.enableRight = enabled;
		if (this._rightCheckbox) {
			this._rightCheckbox.checked = enabled;
		}
		this.log(`Right stick conversion ${enabled ? 'enabled' : 'disabled'}`);
		return enabled;
	}

	/**
	 * Set left analog pass-through
	 * @param {boolean} enabled
	 */
	setPassLeftAnalog(enabled) {
		this.passLeftAnalog = enabled;
		if (this._passLeftCheckbox) {
			this._passLeftCheckbox.checked = enabled;
		}
		this.log(`Left analog pass-through ${enabled ? 'enabled' : 'disabled'}`);
		return enabled;
	}

	/**
	 * Set right analog pass-through
	 * @param {boolean} enabled
	 */
	setPassRightAnalog(enabled) {
		this.passRightAnalog = enabled;
		if (this._passRightCheckbox) {
			this._passRightCheckbox.checked = enabled;
		}
		this.log(`Right analog pass-through ${enabled ? 'enabled' : 'disabled'}`);
		return enabled;
	}

	/**
	 * Set the conversion threshold
	 * @param {number} threshold - Threshold value (0-1)
	 */
	setThreshold(threshold) {
		this.threshold = Math.max(0, Math.min(1, threshold));
		if (this._thresholdSlider) {
			this._thresholdSlider.value = this.threshold;
		}
		if (this._thresholdDisplay) {
			this._thresholdDisplay.textContent = this.threshold.toFixed(2);
		}
		this.log(`Threshold set to ${this.threshold.toFixed(2)}`);
		return this.threshold;
	}

	/**
	 * Toggle both stick conversions
	 */
	toggleBoth() {
		const newState = !(this.enableLeft && this.enableRight);
		this.setLeftEnabled(newState);
		this.setRightEnabled(newState);
		return newState;
	}

	_processInternal(state, deltaTime) {
		// Left stick to D-Pad conversion
		if (this.enableLeft) {
			const lx = state.analog.leftX;
			const ly = state.analog.leftY;

			// Convert to D-Pad based on threshold
			state.digital.dpadLeft = lx < -this.threshold;
			state.digital.dpadRight = lx > this.threshold;
			state.digital.dpadUp = ly > this.threshold;
			state.digital.dpadDown = ly < -this.threshold;

			// Optionally neutralize analog
			if (!this.passLeftAnalog) {
				state.analog.leftX = 0;
				state.analog.leftY = 0;
			}
		}

		// Right stick to ABXY conversion
		if (this.enableRight) {
			const rx = state.analog.rightX;
			const ry = state.analog.rightY;

			// Convert to ABXY based on threshold
			// Using Nintendo/Xbox layout: A=bottom, B=right, X=left, Y=top
			state.digital.buttonX = ry < -this.threshold;  // Up
			state.digital.buttonA = rx > this.threshold;   // Right
			state.digital.buttonY = rx < -this.threshold;  // Left
			state.digital.buttonB = ry > this.threshold;   // Down

			// Optionally neutralize analog
			if (!this.passRightAnalog) {
				state.analog.rightX = 0;
				state.analog.rightY = 0;
			}
		}

		return state;
	}

	createControls() {
		const container = document.createElement('div');
		container.className = 'manipulator-controls a2d-custom';

		// Main controls
		const mainControls = document.createElement('div');
		mainControls.className = 'manipulator-control-group-horizontal';

		// Left stick controls
		const leftDiv = document.createElement('div');

		const leftTitle = document.createElement('h4');
		leftTitle.textContent = 'Left Stick → D-Pad';
		leftDiv.appendChild(leftTitle);

		const leftEnable = document.createElement('label');
		this._leftCheckbox = document.createElement('input');
		this._leftCheckbox.type = 'checkbox';
		this._leftCheckbox.checked = this.enableLeft;
		this._leftCheckbox.addEventListener('change', () => {
			this.executeAction('setLeftEnabled', { enabled: this._leftCheckbox.checked });
		});
		leftEnable.appendChild(this._leftCheckbox);
		leftEnable.appendChild(document.createTextNode(' Enable conversion'));

		const leftPass = document.createElement('label');
		this._passLeftCheckbox = document.createElement('input');
		this._passLeftCheckbox.type = 'checkbox';
		this._passLeftCheckbox.checked = this.passLeftAnalog;
		this._passLeftCheckbox.addEventListener('change', () => {
			this.executeAction('setPassLeftAnalog', { enabled: this._passLeftCheckbox.checked });
		});
		leftPass.appendChild(this._passLeftCheckbox);
		leftPass.appendChild(document.createTextNode(' Pass analog through'));

		leftDiv.appendChild(leftEnable);
		leftDiv.appendChild(leftPass);

		// Right stick controls
		const rightDiv = document.createElement('div');

		const rightTitle = document.createElement('h4');
		rightTitle.textContent = 'Right Stick → ABXY';
		rightDiv.appendChild(rightTitle);

		const rightEnable = document.createElement('label');
		this._rightCheckbox = document.createElement('input');
		this._rightCheckbox.type = 'checkbox';
		this._rightCheckbox.checked = this.enableRight;
		this._rightCheckbox.addEventListener('change', () => {
			this.executeAction('setRightEnabled', { enabled: this._rightCheckbox.checked });
		});
		rightEnable.appendChild(this._rightCheckbox);
		rightEnable.appendChild(document.createTextNode(' Enable conversion'));

		const rightPass = document.createElement('label');
		this._passRightCheckbox = document.createElement('input');
		this._passRightCheckbox.type = 'checkbox';
		this._passRightCheckbox.checked = this.passRightAnalog;
		this._passRightCheckbox.addEventListener('change', () => {
			this.executeAction('setPassRightAnalog', { enabled: this._passRightCheckbox.checked });
		});
		rightPass.appendChild(this._passRightCheckbox);
		rightPass.appendChild(document.createTextNode(' Pass analog through'));

		rightDiv.appendChild(rightEnable);
		rightDiv.appendChild(rightPass);

		mainControls.appendChild(leftDiv);
		mainControls.appendChild(rightDiv);

		// Threshold control
		const thresholdDiv = document.createElement('div');
		thresholdDiv.className = 'manipulator-control-group';

		const thresholdLabel = document.createElement('label');
		thresholdLabel.textContent = 'Threshold: ';

		this._thresholdSlider = document.createElement('input');
		this._thresholdSlider.type = 'range';
		this._thresholdSlider.min = '0';
		this._thresholdSlider.max = '1';
		this._thresholdSlider.step = '0.01';
		this._thresholdSlider.value = this.threshold;

		this._thresholdDisplay = document.createElement('span');
		this._thresholdDisplay.textContent = this.threshold.toFixed(2);

		this._thresholdSlider.addEventListener('input', () => {
			const value = parseFloat(this._thresholdSlider.value);
			this._thresholdDisplay.textContent = value.toFixed(2);
		});

		this._thresholdSlider.addEventListener('change', () => {
			const value = parseFloat(this._thresholdSlider.value);
			this.executeAction('setThreshold', { threshold: value });
		});

		thresholdDiv.appendChild(thresholdLabel);
		thresholdDiv.appendChild(this._thresholdSlider);
		thresholdDiv.appendChild(this._thresholdDisplay);

		// Quick actions
		const actionsDiv = document.createElement('div');
		actionsDiv.className = 'quick-actions';

		const toggleBtn = document.createElement('button');
		toggleBtn.textContent = 'Toggle Both';
		toggleBtn.className = 'button small';
		toggleBtn.addEventListener('click', () => {
			this.executeAction('toggleBoth');
		});

		actionsDiv.appendChild(toggleBtn);

		// Assemble UI
		container.appendChild(mainControls);
		container.appendChild(thresholdDiv);
		container.appendChild(actionsDiv);

		return container;
	}

	_getSpecificConfig() {
		return {
			enableLeft: this.enableLeft,
			enableRight: this.enableRight,
			passLeftAnalog: this.passLeftAnalog,
			passRightAnalog: this.passRightAnalog,
			threshold: this.threshold
		};
	}

	_setSpecificConfig(config) {
		if (config.enableLeft !== undefined) {
			this.setLeftEnabled(config.enableLeft);
		}
		if (config.enableRight !== undefined) {
			this.setRightEnabled(config.enableRight);
		}
		if (config.passLeftAnalog !== undefined) {
			this.setPassLeftAnalog(config.passLeftAnalog);
		}
		if (config.passRightAnalog !== undefined) {
			this.setPassRightAnalog(config.passRightAnalog);
		}
		if (config.threshold !== undefined) {
			this.setThreshold(config.threshold);
		}
	}

	dispose() {
		super.dispose();
		this._leftCheckbox = null;
		this._rightCheckbox = null;
		this._passLeftCheckbox = null;
		this._passRightCheckbox = null;
		this._thresholdSlider = null;
		this._thresholdDisplay = null;
	}
}