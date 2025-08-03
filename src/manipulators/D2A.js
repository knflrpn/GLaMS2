/**
 * ./src/manipulators/D2A.js
 *
 * Manipulator that converts digital button presses to analog stick inputs.
 * D-Pad -> Left stick, ABXY -> Right stick
 */
import { BaseManipulator } from './BaseManipulator.js';

/**
 * @typedef {Object} D2AParams
 * @property {boolean} [enableLeft=true] - Enable D-Pad to left stick conversion
 * @property {boolean} [enableRight=true] - Enable ABXY to right stick conversion
 * @property {boolean} [passDigital=true] - Pass through digital button values
 * @property {boolean} [passAnalog=true] - Pass through existing analog values
 * @property {number} [magnitude=1.0] - Magnitude of analog output (0-1)
 * @property {boolean} [normalize=true] - Normalize diagonal inputs to unit circle
 */

export class D2A extends BaseManipulator {
	static get defaultConfig() {
		return {
			enableLeft: true,
			enableRight: true,
			passDigital: true,
			passAnalog: true,
			magnitude: 1.0,
			normalize: true
		};
	}

	static get displayName() {
		return "Buttons to Sticks";
	}

	static get description() {
		return "Convert digital button presses to that direction's analog stick movement.";
	}

	/**
	 * @param {D2AParams} params - Configuration parameters
	 */
	constructor(params = {}) {
		super(params);

		this.enableLeft = params.enableLeft ?? true;
		this.enableRight = params.enableRight ?? true;
		this.passDigital = params.passDigital ?? true;
		this.passAnalog = params.passAnalog ?? true;
		this.magnitude = params.magnitude ?? 1.0;
		this.normalize = params.normalize ?? true;

		// UI elements
		this._leftCheckbox = null;
		this._rightCheckbox = null;
		this._passDigitalCheckbox = null;
		this._passAnalogCheckbox = null;
		this._magnitudeSlider = null;
		this._magnitudeDisplay = null;
		this._normalizeCheckbox = null;

		// Register D2A-specific actions
		this._registerD2AActions();
	}

	/**
	 * Register actions specific to the D2A manipulator
	 */
	_registerD2AActions() {
		this.registerAction({
			name: 'setLeftEnabled',
			displayName: 'Enable Left Conversion',
			description: 'Enable/disable D-Pad to left stick conversion',
			parameters: [
				{
					name: 'enabled',
					type: 'boolean',
					description: 'Enable D-Pad conversion',
					required: true
				}
			],
			handler: (params) => this.setLeftEnabled(params.enabled)
		});

		this.registerAction({
			name: 'setRightEnabled',
			displayName: 'Enable Right Conversion',
			description: 'Enable/disable ABXY to right stick conversion',
			parameters: [
				{
					name: 'enabled',
					type: 'boolean',
					description: 'Enable ABXY conversion',
					required: true
				}
			],
			handler: (params) => this.setRightEnabled(params.enabled)
		});

		this.registerAction({
			name: 'setPassDigital',
			displayName: 'Pass Digital Buttons',
			description: 'Enable/disable passing through digital button values',
			parameters: [
				{
					name: 'enabled',
					type: 'boolean',
					description: 'Pass through digital buttons',
					required: true
				}
			],
			handler: (params) => this.setPassDigital(params.enabled)
		});

		this.registerAction({
			name: 'setPassAnalog',
			displayName: 'Pass Analog Values',
			description: 'Enable/disable passing through existing analog values',
			parameters: [
				{
					name: 'enabled',
					type: 'boolean',
					description: 'Pass through analog values',
					required: true
				}
			],
			handler: (params) => this.setPassAnalog(params.enabled)
		});

		this.registerAction({
			name: 'setMagnitude',
			displayName: 'Set Magnitude',
			description: 'Set the magnitude of analog output',
			parameters: [
				{
					name: 'magnitude',
					type: 'number',
					description: 'Magnitude value (0-1)',
					required: true,
					default: 1.0
				}
			],
			handler: (params) => this.setMagnitude(params.magnitude)
		});

		this.registerAction({
			name: 'setNormalize',
			displayName: 'Set Normalize',
			description: 'Enable/disable diagonal input normalization',
			parameters: [
				{
					name: 'enabled',
					type: 'boolean',
					description: 'Normalize diagonal inputs',
					required: true
				}
			],
			handler: (params) => this.setNormalize(params.enabled)
		});

	}

	/**
	 * Set left conversion enabled state
	 * @param {boolean} enabled
	 */
	setLeftEnabled(enabled) {
		this.enableLeft = enabled;
		if (this._leftCheckbox) {
			this._leftCheckbox.checked = enabled;
		}
		this.log(`D-Pad to left stick conversion ${enabled ? 'enabled' : 'disabled'}`);
		return enabled;
	}

	/**
	 * Set right conversion enabled state
	 * @param {boolean} enabled
	 */
	setRightEnabled(enabled) {
		this.enableRight = enabled;
		if (this._rightCheckbox) {
			this._rightCheckbox.checked = enabled;
		}
		this.log(`ABXY to right stick conversion ${enabled ? 'enabled' : 'disabled'}`);
		return enabled;
	}

	/**
	 * Set digital pass-through
	 * @param {boolean} enabled
	 */
	setPassDigital(enabled) {
		this.passDigital = enabled;
		if (this._passDigitalCheckbox) {
			this._passDigitalCheckbox.checked = enabled;
		}
		this.log(`Digital button pass-through ${enabled ? 'enabled' : 'disabled'}`);
		return enabled;
	}

	/**
	 * Set analog pass-through
	 * @param {boolean} enabled
	 */
	setPassAnalog(enabled) {
		this.passAnalog = enabled;
		if (this._passAnalogCheckbox) {
			this._passAnalogCheckbox.checked = enabled;
		}
		this.log(`Analog pass-through ${enabled ? 'enabled' : 'disabled'}`);
		return enabled;
	}

	/**
	 * Set the output magnitude
	 * @param {number} magnitude - Magnitude value (0-1)
	 */
	setMagnitude(magnitude) {
		this.magnitude = Math.max(0, Math.min(1, magnitude));
		if (this._magnitudeSlider) {
			this._magnitudeSlider.value = this.magnitude;
		}
		if (this._magnitudeDisplay) {
			this._magnitudeDisplay.textContent = this.magnitude.toFixed(2);
		}
		this.log(`Magnitude set to ${this.magnitude.toFixed(2)}`);
		return this.magnitude;
	}

	/**
	 * Set diagonal normalization
	 * @param {boolean} enabled
	 */
	setNormalize(enabled) {
		this.normalize = enabled;
		if (this._normalizeCheckbox) {
			this._normalizeCheckbox.checked = enabled;
		}
		this.log(`Diagonal normalization ${enabled ? 'enabled' : 'disabled'}`);
		return enabled;
	}

	_processInternal(state, deltaTime) {
		// D-Pad to left stick conversion
		if (this.enableLeft) {
			let lx = 0;
			let ly = 0;

			// Convert D-Pad to analog values
			if (state.digital.dpadLeft) lx -= 1;
			if (state.digital.dpadRight) lx += 1;
			if (state.digital.dpadUp) ly -= 1;
			if (state.digital.dpadDown) ly += 1;

			// Apply magnitude scaling
			lx *= this.magnitude;
			ly *= this.magnitude;

			// Set analog values (additive if passAnalog is enabled)
			if (this.passAnalog) {
				state.analog.leftX += lx;
				state.analog.leftY += ly;
			} else {
				state.analog.leftX = lx;
				state.analog.leftY = ly;
			}

			// Normalize final values if enabled
			if (this.normalize && (state.analog.leftX !== 0 || state.analog.leftY !== 0)) {
				const length = Math.sqrt(state.analog.leftX * state.analog.leftX + state.analog.leftY * state.analog.leftY);
				if (length > 1) {
					state.analog.leftX /= length;
					state.analog.leftY /= length;
				}
			}

			// Clamp to valid range
			state.analog.leftX = Math.max(-1, Math.min(1, state.analog.leftX));
			state.analog.leftY = Math.max(-1, Math.min(1, state.analog.leftY));

			// Optionally clear digital inputs
			if (!this.passDigital) {
				state.digital.dpadLeft = false;
				state.digital.dpadRight = false;
				state.digital.dpadUp = false;
				state.digital.dpadDown = false;
			}
		}

		// ABXY to right stick conversion
		if (this.enableRight) {
			let rx = 0;
			let ry = 0;

			// Convert ABXY to analog values
			// Using Nintendo/Xbox layout: A=right, B=down, X=up, Y=left
			if (state.digital.buttonY) rx -= 1;  // Y=left
			if (state.digital.buttonA) rx += 1;  // A=right
			if (state.digital.buttonX) ry -= 1;  // X=up
			if (state.digital.buttonB) ry += 1;  // B=down

			// Apply magnitude scaling
			rx *= this.magnitude;
			ry *= this.magnitude;

			// Normalize diagonal inputs if enabled
			if (this.normalize && (rx !== 0 && ry !== 0)) {
				const length = Math.sqrt(rx * rx + ry * ry);
				rx = (rx / length) * this.magnitude;
				ry = (ry / length) * this.magnitude;
			}

			// Set analog values (additive if passAnalog is enabled)
			if (this.passAnalog) {
				state.analog.rightX += rx;
				state.analog.rightY += ry;
				// Clamp to valid range
				state.analog.rightX = Math.max(-1, Math.min(1, state.analog.rightX));
				state.analog.rightY = Math.max(-1, Math.min(1, state.analog.rightY));
			} else {
				state.analog.rightX = rx;
				state.analog.rightY = ry;
			}

			// Optionally clear digital inputs
			if (!this.passDigital) {
				state.digital.buttonA = false;
				state.digital.buttonB = false;
				state.digital.buttonX = false;
				state.digital.buttonY = false;
			}
		}

		return state;
	}

	createControls() {
		const container = document.createElement('div');
		container.className = 'manipulator-controls d2a-custom';

		// Main controls
		const mainControls = document.createElement('div');
		mainControls.className = 'manipulator-control-group-horizontal';

		// Left conversion controls
		const leftDiv = document.createElement('div');

		const leftTitle = document.createElement('h4');
		leftTitle.textContent = 'D-Pad → Left Stick';
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

		leftDiv.appendChild(leftEnable);

		// Right conversion controls
		const rightDiv = document.createElement('div');

		const rightTitle = document.createElement('h4');
		rightTitle.textContent = 'ABXY → Right Stick';
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

		rightDiv.appendChild(rightEnable);

		mainControls.appendChild(leftDiv);
		mainControls.appendChild(rightDiv);

		// Pass-through controls
		const passControls = document.createElement('div');
		passControls.className = 'manipulator-control-group-horizontal';

		const passDigital = document.createElement('label');
		this._passDigitalCheckbox = document.createElement('input');
		this._passDigitalCheckbox.type = 'checkbox';
		this._passDigitalCheckbox.checked = this.passDigital;
		this._passDigitalCheckbox.addEventListener('change', () => {
			this.executeAction('setPassDigital', { enabled: this._passDigitalCheckbox.checked });
		});
		passDigital.appendChild(this._passDigitalCheckbox);
		passDigital.appendChild(document.createTextNode(' Pass digital buttons'));

		const passAnalog = document.createElement('label');
		this._passAnalogCheckbox = document.createElement('input');
		this._passAnalogCheckbox.type = 'checkbox';
		this._passAnalogCheckbox.checked = this.passAnalog;
		this._passAnalogCheckbox.addEventListener('change', () => {
			this.executeAction('setPassAnalog', { enabled: this._passAnalogCheckbox.checked });
		});
		passAnalog.appendChild(this._passAnalogCheckbox);
		passAnalog.appendChild(document.createTextNode(' Pass existing analog'));

		passControls.appendChild(passDigital);
		passControls.appendChild(passAnalog);

		// Magnitude control
		const magnitudeDiv = document.createElement('div');
		magnitudeDiv.className = 'manipulator-control-group';

		const magnitudeLabel = document.createElement('label');
		magnitudeLabel.textContent = 'Magnitude: ';

		this._magnitudeSlider = document.createElement('input');
		this._magnitudeSlider.type = 'range';
		this._magnitudeSlider.min = '0';
		this._magnitudeSlider.max = '1';
		this._magnitudeSlider.step = '0.01';
		this._magnitudeSlider.value = this.magnitude;

		this._magnitudeDisplay = document.createElement('span');
		this._magnitudeDisplay.textContent = this.magnitude.toFixed(2);

		this._magnitudeSlider.addEventListener('input', () => {
			const value = parseFloat(this._magnitudeSlider.value);
			this._magnitudeDisplay.textContent = value.toFixed(2);
		});

		this._magnitudeSlider.addEventListener('change', () => {
			const value = parseFloat(this._magnitudeSlider.value);
			this.executeAction('setMagnitude', { magnitude: value });
		});

		magnitudeDiv.appendChild(magnitudeLabel);
		magnitudeDiv.appendChild(this._magnitudeSlider);
		magnitudeDiv.appendChild(this._magnitudeDisplay);

		// Normalize control
		const normalizeDiv = document.createElement('div');
		normalizeDiv.className = 'manipulator-control-group';

		const normalizeLabel = document.createElement('label');
		this._normalizeCheckbox = document.createElement('input');
		this._normalizeCheckbox.type = 'checkbox';
		this._normalizeCheckbox.checked = this.normalize;
		this._normalizeCheckbox.addEventListener('change', () => {
			this.executeAction('setNormalize', { enabled: this._normalizeCheckbox.checked });
		});
		normalizeLabel.appendChild(this._normalizeCheckbox);
		normalizeLabel.appendChild(document.createTextNode(' Normalize diagonal inputs'));

		normalizeDiv.appendChild(normalizeLabel);

		// Quick actions
		const actionsDiv = document.createElement('div');
		actionsDiv.className = 'quick-actions';

		// Assemble UI
		container.appendChild(mainControls);
		container.appendChild(magnitudeDiv);
		container.appendChild(passControls);
		container.appendChild(normalizeDiv);
		container.appendChild(actionsDiv);

		return container;
	}

	_getSpecificConfig() {
		return {
			enableLeft: this.enableLeft,
			enableRight: this.enableRight,
			passDigital: this.passDigital,
			passAnalog: this.passAnalog,
			magnitude: this.magnitude,
			normalize: this.normalize
		};
	}

	_setSpecificConfig(config) {
		if (config.enableLeft !== undefined) {
			this.setLeftEnabled(config.enableLeft);
		}
		if (config.enableRight !== undefined) {
			this.setRightEnabled(config.enableRight);
		}
		if (config.passDigital !== undefined) {
			this.setPassDigital(config.passDigital);
		}
		if (config.passAnalog !== undefined) {
			this.setPassAnalog(config.passAnalog);
		}
		if (config.magnitude !== undefined) {
			this.setMagnitude(config.magnitude);
		}
		if (config.normalize !== undefined) {
			this.setNormalize(config.normalize);
		}
	}

	dispose() {
		super.dispose();
		this._leftCheckbox = null;
		this._rightCheckbox = null;
		this._passDigitalCheckbox = null;
		this._passAnalogCheckbox = null;
		this._magnitudeSlider = null;
		this._magnitudeDisplay = null;
		this._normalizeCheckbox = null;
	}
}