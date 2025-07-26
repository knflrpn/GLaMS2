/**
 * ./src/manipulators/Shaker.js
 *
 * Manipulator that simulates controller shaking by injecting IMU data when a trigger button is pressed.
 */
import { BaseManipulator } from './BaseManipulator.js';

/**
 * @typedef {Object} ShakerParams
 * @property {string} [triggerButton='buttonA'] - Button name that triggers shaking
 * @property {number} [intensity=5.0] - Shake intensity multiplier (0.1-10.0)
 * @property {number} [frequency=8.0] - Shake frequency in Hz (1-20)
 * @property {number} [duration=500] - Shake duration in milliseconds (100-5000)
 * @property {string} [mode='burst'] - Shake mode: 'burst' (single shake) or 'continuous' (while held)
 */

export class Shaker extends BaseManipulator {
	static get defaultConfig() {
		return {
			triggerButton: 'buttonA',
			intensity: 1.0,
			frequency: 2.0,
			duration: 500,
			mode: 'burst'
		};
	}

	static get displayName() {
		return "Shaker";
	}

	static get requiredSwiCC() {
		return {
			type: "2wiCC", // SwiCC or 2wiCC
			firmware: "1.2",
		};
	}

	/**
	 * @param {ShakerParams} params - Configuration parameters
	 */
	constructor(params = {}) {
		super(params);

		this.triggerButton = params.triggerButton || Shaker.defaultConfig.triggerButton;
		this.intensity = params.intensity || Shaker.defaultConfig.intensity;
		this.frequency = params.frequency || Shaker.defaultConfig.frequency;
		this.duration = params.duration || Shaker.defaultConfig.duration;
		this.mode = params.mode || Shaker.defaultConfig.mode;

		// Shake state
		this.isShaking = false;
		this.shakeTimer = 0;
		this.shakePhase = 0;
		this.shakePhaseOffset = 0;
		this.lastTriggerState = false;

		// UI elements
		this._triggerSelect = null;
		this._intensityInput = null;
		this._frequencyInput = null;
		this._durationInput = null;
		this._modeSelect = null;

		// Register shaker-specific actions
		this._registerShakerActions();
	}

	/**
	 * Register actions specific to the shaker manipulator
	 */
	_registerShakerActions() {
		this.registerAction({
			name: 'setTriggerButton',
			displayName: 'Set Trigger Button',
			description: 'Set which button triggers the shake',
			parameters: [
				{
					name: 'buttonName',
					type: 'string',
					description: 'Name of the button (e.g., buttonA, dpadUp)',
					required: true
				}
			],
			handler: (params) => this.setTriggerButton(params.buttonName)
		});

		this.registerAction({
			name: 'setIntensity',
			displayName: 'Set Intensity',
			description: 'Set the shake intensity',
			parameters: [
				{
					name: 'intensity',
					type: 'number',
					description: 'Intensity multiplier (0.1-10.0)',
					required: true,
					default: 5.0
				}
			],
			handler: (params) => this.setIntensity(params.intensity)
		});

		this.registerAction({
			name: 'setFrequency',
			displayName: 'Set Frequency',
			description: 'Set the shake frequency in Hz',
			parameters: [
				{
					name: 'frequency',
					type: 'number',
					description: 'Frequency in Hz (1-20)',
					required: true,
					default: 8.0
				}
			],
			handler: (params) => this.setFrequency(params.frequency)
		});

		this.registerAction({
			name: 'setDuration',
			displayName: 'Set Duration',
			description: 'Set the shake duration in milliseconds',
			parameters: [
				{
					name: 'duration',
					type: 'number',
					description: 'Duration in milliseconds (100-5000)',
					required: true,
					default: 500
				}
			],
			handler: (params) => this.setDuration(params.duration)
		});

		this.registerAction({
			name: 'setMode',
			displayName: 'Set Mode',
			description: 'Set the shake mode',
			parameters: [
				{
					name: 'mode',
					type: 'string',
					description: 'Mode: "burst" or "continuous"',
					required: true,
					default: 'burst'
				}
			],
			handler: (params) => this.setMode(params.mode)
		});

		this.registerAction({
			name: 'triggerShake',
			displayName: 'Trigger Shake',
			description: 'Manually trigger a shake sequence',
			handler: () => this.triggerShake()
		});

		this.registerAction({
			name: 'stopShake',
			displayName: 'Stop Shake',
			description: 'Stop any active shake sequence',
			handler: () => this.stopShake()
		});
	}

	/**
	 * Set the trigger button
	 * @param {string} buttonName
	 */
	setTriggerButton(buttonName) {
		if (!buttonName) {
			throw new Error('Button name is required');
		}

		this.triggerButton = buttonName;

		if (this._triggerSelect) {
			this._triggerSelect.value = buttonName;
		}

		this.log(`Trigger button set to ${buttonName}`);
		return buttonName;
	}

	/**
	 * Set the shake intensity
	 * @param {number} intensity
	 */
	setIntensity(intensity) {
		const newIntensity = Math.max(0.1, Math.min(10.0, intensity));
		this.intensity = newIntensity;

		if (this._intensityInput) {
			this._intensityInput.value = newIntensity;
		}

		this.log(`Intensity set to ${newIntensity}`);
		return newIntensity;
	}

	/**
	 * Set the shake frequency
	 * @param {number} frequency
	 */
	setFrequency(frequency) {
		const newFreq = Math.max(1, Math.min(20, frequency));
		this.frequency = newFreq;

		if (this._frequencyInput) {
			this._frequencyInput.value = newFreq;
		}

		this.log(`Frequency set to ${newFreq} Hz`);
		return newFreq;
	}

	/**
	 * Set the shake duration
	 * @param {number} duration
	 */
	setDuration(duration) {
		const newDuration = Math.max(100, Math.min(5000, duration));
		this.duration = newDuration;

		if (this._durationInput) {
			this._durationInput.value = newDuration;
		}

		this.log(`Duration set to ${newDuration} ms`);
		return newDuration;
	}

	/**
	 * Set the shake mode
	 * @param {string} mode
	 */
	setMode(mode) {
		if (!['burst', 'continuous'].includes(mode)) {
			throw new Error('Mode must be "burst" or "continuous"');
		}

		this.mode = mode;

		if (this._modeSelect) {
			this._modeSelect.value = mode;
		}

		this.log(`Mode set to ${mode}`);
		return mode;
	}

	/**
	 * Manually trigger a shake sequence
	 */
	triggerShake() {
		this.isShaking = true;
		this.shakeTimer = 0;
		this.shakePhaseOffset = Math.random()*3;
		this.log('Shake triggered');
		return true;
	}

	/**
	 * Stop any active shake sequence
	 */
	stopShake() {
		this.isShaking = false;
		this.shakeTimer = 0;
		this.log('Shake stopped');
		return true;
	}

	/**
	 * Generate shake values for IMU data
	 * @param {Object} imuSample - Original IMU sample
	 * @param {number} phase - Current phase in the shake cycle (0-1)
	 * @returns {Object} IMU sample with shake data
	 */
	_generateShakeIMU(imuSample, phase) {
		// Generate pseudo-random but repeatable shake patterns
		const time = phase * Math.PI * 2 + this.shakePhaseOffset;
		const noiseX = Math.sin(time * 0.7);
		const noiseY = Math.cos(time * 1.3);
		const noiseZ = Math.sin(time * 1.0);

		// Base shake pattern with intensity scaling
		const baseAccel = this.intensity * 2.0;
		const baseGyro = this.intensity * 6.0;

		imuSample.accelX += baseAccel * noiseX;
		imuSample.accelY += baseAccel * noiseY;
		imuSample.accelZ += baseAccel * noiseZ;
		imuSample.gyroX += baseGyro * noiseY;
		imuSample.gyroY += baseGyro * noiseX;
		imuSample.gyroZ += baseGyro * noiseZ;
	}

	_processInternal(state, deltaTime) {
		const currentTriggerState = state.digital[this.triggerButton] || false;

		// Check for trigger button press
		if (this.mode === 'burst') {
			// Burst mode: trigger on button press edge
			if (currentTriggerState && !this.lastTriggerState) {
				this.triggerShake();
			}
		} else if (this.mode === 'continuous') {
			// Continuous mode: shake while button is held
			if (currentTriggerState && !this.isShaking) {
				this.triggerShake();
			} else if (!currentTriggerState && this.isShaking) {
				this.stopShake();
			}
		}

		this.lastTriggerState = currentTriggerState;

		// Update shake state
		if (this.isShaking) {
			this.shakeTimer += deltaTime;

			// Calculate phase based on frequency
			const cycleLength = 1000 / this.frequency; // milliseconds per cycle
			this.shakePhase = (this.shakeTimer % cycleLength) / cycleLength;

			// Check if burst duration has elapsed
			if (this.mode === 'burst' && this.shakeTimer >= this.duration) {
				this.stopShake();
			}

			// Generate and inject shake IMU data
			if (this.isShaking) {
				this._generateShakeIMU(state.imuSample, this.shakePhase);
			}
		}

		return state;
	}

	createControls() {
		const container = document.createElement('div');
		container.className = 'manipulator-controls shaker-custom';

		// Trigger button selection
		const triggerDiv = document.createElement('div');
		triggerDiv.className = 'inline-with-gap';

		const triggerLabel = document.createElement('label');
		triggerLabel.textContent = 'Trigger Button:';

		this._triggerSelect = document.createElement('select');

		// Define available buttons
		const buttonOptions = [
			{ value: 'buttonA', text: 'A' },
			{ value: 'buttonB', text: 'B' },
			{ value: 'buttonX', text: 'X' },
			{ value: 'buttonY', text: 'Y' },
			{ value: 'buttonL', text: 'L' },
			{ value: 'buttonR', text: 'R' },
			{ value: 'buttonZL', text: 'ZL' },
			{ value: 'buttonZR', text: 'ZR' },
			{ value: 'buttonThumbL', text: 'L3' },
			{ value: 'buttonThumbR', text: 'R3' },
			{ value: 'dpadUp', text: 'D-Pad Up' },
			{ value: 'dpadDown', text: 'D-Pad Down' },
			{ value: 'dpadLeft', text: 'D-Pad Left' },
			{ value: 'dpadRight', text: 'D-Pad Right' },
			{ value: 'buttonMinus', text: 'Minus' },
			{ value: 'buttonPlus', text: 'Plus' },
			{ value: 'buttonHome', text: 'Home' },
			{ value: 'buttonCapture', text: 'Capture' }
		];

		buttonOptions.forEach(option => {
			const optionElement = document.createElement('option');
			optionElement.value = option.value;
			optionElement.textContent = option.text;
			this._triggerSelect.appendChild(optionElement);
		});

		this._triggerSelect.value = this.triggerButton;
		this._triggerSelect.addEventListener('change', () => {
			this.executeAction('setTriggerButton', { buttonName: this._triggerSelect.value });
		});

		triggerDiv.appendChild(triggerLabel);
		triggerDiv.appendChild(this._triggerSelect);

		// Mode selection
		const modeDiv = document.createElement('div');
		modeDiv.className = 'inline-with-gap';

		const modeLabel = document.createElement('label');
		modeLabel.textContent = 'Mode:';

		this._modeSelect = document.createElement('select');

		const modeOptions = [
			{ value: 'burst', text: 'Burst (single shake)' },
			{ value: 'continuous', text: 'Continuous (while held)' }
		];

		modeOptions.forEach(option => {
			const optionElement = document.createElement('option');
			optionElement.value = option.value;
			optionElement.textContent = option.text;
			this._modeSelect.appendChild(optionElement);
		});

		this._modeSelect.value = this.mode;
		this._modeSelect.addEventListener('change', () => {
			this.executeAction('setMode', { mode: this._modeSelect.value });
		});

		modeDiv.appendChild(modeLabel);
		modeDiv.appendChild(this._modeSelect);

		// Intensity control
		const intensityDiv = document.createElement('div');
		intensityDiv.className = 'inline-with-gap';

		const intensityLabel = document.createElement('label');
		intensityLabel.textContent = 'Intensity:';

		this._intensityInput = document.createElement('input');
		this._intensityInput.type = 'range';
		this._intensityInput.min = '0.5';
		this._intensityInput.max = '6.0';
		this._intensityInput.step = '0.5';
		this._intensityInput.value = this.intensity;

		const intensityValue = document.createElement('span');
		intensityValue.textContent = this.intensity.toFixed(1);
		intensityValue.className = 'shaker-value-display';

		this._intensityInput.addEventListener('input', () => {
			const newIntensity = parseFloat(this._intensityInput.value);
			intensityValue.textContent = newIntensity.toFixed(1);
			this.executeAction('setIntensity', { intensity: newIntensity });
		});

		intensityDiv.appendChild(intensityLabel);
		intensityDiv.appendChild(this._intensityInput);
		intensityDiv.appendChild(intensityValue);

		// Frequency control
		const frequencyDiv = document.createElement('div');
		frequencyDiv.className = 'inline-with-gap';

		const frequencyLabel = document.createElement('label');
		frequencyLabel.textContent = 'Frequency (Hz):';

		this._frequencyInput = document.createElement('input');
		this._frequencyInput.type = 'range';
		this._frequencyInput.min = '1';
		this._frequencyInput.max = '6';
		this._frequencyInput.step = '0.2';
		this._frequencyInput.value = this.frequency;

		const frequencyValue = document.createElement('span');
		frequencyValue.textContent = this.frequency.toFixed(1);
		frequencyValue.className = 'shaker-value-display';

		this._frequencyInput.addEventListener('input', () => {
			const newFrequency = parseFloat(this._frequencyInput.value);
			frequencyValue.textContent = newFrequency.toFixed(1);
			this.executeAction('setFrequency', { frequency: newFrequency });
		});

		frequencyDiv.appendChild(frequencyLabel);
		frequencyDiv.appendChild(this._frequencyInput);
		frequencyDiv.appendChild(frequencyValue);

		// Duration control (only shown in burst mode)
		const durationDiv = document.createElement('div');
		durationDiv.className = 'inline-with-gap';

		const durationLabel = document.createElement('label');
		durationLabel.textContent = 'Duration (ms):';

		this._durationInput = document.createElement('input');
		this._durationInput.type = 'range';
		this._durationInput.min = '250';
		this._durationInput.max = '2000';
		this._durationInput.step = '50';
		this._durationInput.value = this.duration;

		const durationValue = document.createElement('span');
		durationValue.textContent = this.duration.toString();
		durationValue.className = 'shaker-value-display';

		this._durationInput.addEventListener('input', () => {
			const newDuration = parseInt(this._durationInput.value);
			durationValue.textContent = newDuration.toString();
			this.executeAction('setDuration', { duration: newDuration });
		});

		durationDiv.appendChild(durationLabel);
		durationDiv.appendChild(this._durationInput);
		durationDiv.appendChild(durationValue);

		// Update duration visibility based on mode
		const updateDurationVisibility = () => {
			durationDiv.style.display = this.mode === 'burst' ? 'block' : 'none';
		};
		updateDurationVisibility();

		// Update mode change handler to toggle duration visibility
		this._modeSelect.addEventListener('change', updateDurationVisibility);

		// Manual trigger button
		const actionsDiv = document.createElement('div');
		actionsDiv.className = 'manipulator-control-group';

		const triggerBtn = document.createElement('button');
		triggerBtn.textContent = 'Test Shake';
		triggerBtn.className = 'button small';
		triggerBtn.addEventListener('click', () => {
			this.executeAction('triggerShake');
		});

		const stopBtn = document.createElement('button');
		stopBtn.textContent = 'Stop';
		stopBtn.className = 'button small';
		stopBtn.addEventListener('click', () => {
			this.executeAction('stopShake');
		});

		actionsDiv.appendChild(triggerBtn);
		actionsDiv.appendChild(stopBtn);

		// Assemble the UI
		container.appendChild(triggerDiv);
		container.appendChild(modeDiv);
		container.appendChild(intensityDiv);
		container.appendChild(frequencyDiv);
		container.appendChild(durationDiv);
		container.appendChild(actionsDiv);

		// Add custom styles
		const style = document.createElement('style');
		style.textContent = `
			.shaker-custom .shaker-value-display {
				margin-left: 8px;
				font-weight: bold;
				min-width: 30px;
				display: inline-block;
			}
			
			.shaker-custom input[type="range"] {
				flex: 1;
				margin: 0 8px;
			}
						
			.shaker-custom label {
				min-width: 120px;
			}
			
			.shaker-custom select {
				flex: 1;
			}
		`;
		container.appendChild(style);

		return container;
	}

	_getSpecificConfig() {
		return {
			triggerButton: this.triggerButton,
			intensity: this.intensity,
			frequency: this.frequency,
			duration: this.duration,
			mode: this.mode
		};
	}

	_setSpecificConfig(config) {
		if (config.triggerButton !== undefined) {
			this.triggerButton = config.triggerButton;
			if (this._triggerSelect) {
				this._triggerSelect.value = this.triggerButton;
			}
		}

		if (config.intensity !== undefined) {
			this.intensity = config.intensity;
			if (this._intensityInput) {
				this._intensityInput.value = this.intensity;
			}
		}

		if (config.frequency !== undefined) {
			this.frequency = config.frequency;
			if (this._frequencyInput) {
				this._frequencyInput.value = this.frequency;
			}
		}

		if (config.duration !== undefined) {
			this.duration = config.duration;
			if (this._durationInput) {
				this._durationInput.value = this.duration;
			}
		}

		if (config.mode !== undefined) {
			this.mode = config.mode;
			if (this._modeSelect) {
				this._modeSelect.value = this.mode;
			}
		}
	}

	onEnabledChanged(enabled) {
		if (!enabled) {
			// Stop any active shake when disabled
			this.stopShake();
		}
	}

	onDetach() {
		super.onDetach();
		this.stopShake();
	}

	dispose() {
		super.dispose();
		this.stopShake();
		this._triggerSelect = null;
		this._intensityInput = null;
		this._frequencyInput = null;
		this._durationInput = null;
		this._modeSelect = null;
	}
}