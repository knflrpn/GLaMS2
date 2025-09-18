/**
 * ./src/manipulators/AnalogScale.js
 *
 * Manipulator that scales analog stick inputs by configurable amounts.
 * Allows independent control of each axis of each stick.
 */
import { BaseManipulator } from './BaseManipulator.js';

/**
 * @typedef {Object} AnalogScaleParams
 * @property {number} [leftXScale=1.0] - Scale factor for left stick X axis (0-1)
 * @property {number} [leftYScale=1.0] - Scale factor for left stick Y axis (0-1)
 * @property {number} [rightXScale=1.0] - Scale factor for right stick X axis (0-1)
 * @property {number} [rightYScale=1.0] - Scale factor for right stick Y axis (0-1)
 */

export class AnalogScale extends BaseManipulator {
	static get defaultConfig() {
		return {
			leftXScale: 1.0,
			leftYScale: 1.0,
			rightXScale: 1.0,
			rightYScale: 1.0
		};
	}

	static get displayName() {
		return "Analog Scale";
	}

	static get description() {
		return "Scale analog stick values independently for each axis.";
	}

	/**
	 * @param {AnalogScaleParams} params - Configuration parameters
	 */
	constructor(params = {}) {
		super(params);

		this.leftXScale = params.leftXScale ?? 1.0;
		this.leftYScale = params.leftYScale ?? 1.0;
		this.rightXScale = params.rightXScale ?? 1.0;
		this.rightYScale = params.rightYScale ?? 1.0;

		// UI elements
		this._leftXSlider = null;
		this._leftYSlider = null;
		this._rightXSlider = null;
		this._rightYSlider = null;
		this._leftXDisplay = null;
		this._leftYDisplay = null;
		this._rightXDisplay = null;
		this._rightYDisplay = null;

		// Register AnalogScale-specific actions
		this._registerAnalogScaleActions();
	}

	/**
	 * Register actions specific to the AnalogScale manipulator
	 */
	_registerAnalogScaleActions() {
		this.registerAction({
			name: 'setLeftXScale',
			displayName: 'Set Left X Scale',
			description: 'Set the scale factor for left stick X axis',
			parameters: [
				{
					name: 'scale',
					type: 'number',
					description: 'Scale factor (-1 to 2)',
					required: true,
					default: 1.0
				}
			],
			handler: (params) => this.setLeftXScale(params.scale)
		});

		this.registerAction({
			name: 'setLeftYScale',
			displayName: 'Set Left Y Scale',
			description: 'Set the scale factor for left stick Y axis',
			parameters: [
				{
					name: 'scale',
					type: 'number',
					description: 'Scale factor (-1 to 2)',
					required: true,
					default: 1.0
				}
			],
			handler: (params) => this.setLeftYScale(params.scale)
		});

		this.registerAction({
			name: 'setRightXScale',
			displayName: 'Set Right X Scale',
			description: 'Set the scale factor for right stick X axis',
			parameters: [
				{
					name: 'scale',
					type: 'number',
					description: 'Scale factor (-1 to 2)',
					required: true,
					default: 1.0
				}
			],
			handler: (params) => this.setRightXScale(params.scale)
		});

		this.registerAction({
			name: 'setRightYScale',
			displayName: 'Set Right Y Scale',
			description: 'Set the scale factor for right stick Y axis',
			parameters: [
				{
					name: 'scale',
					type: 'number',
					description: 'Scale factor (-1 to 2)',
					required: true,
					default: 1.0
				}
			],
			handler: (params) => this.setRightYScale(params.scale)
		});

		this.registerAction({
			name: 'setAllScales',
			displayName: 'Set All Scales',
			description: 'Set all scale factors at once',
			parameters: [
				{
					name: 'scale',
					type: 'number',
					description: 'Scale factor to apply to all axes (-1 to 2)',
					required: true,
					default: 1.0
				}
			],
			handler: (params) => this.setAllScales(params.scale)
		});

		this.registerAction({
			name: 'resetScales',
			displayName: 'Reset Scales',
			description: 'Reset all scale factors to 1.0',
			handler: () => this.resetScales()
		});
	}

	/**
	 * Set left stick X axis scale
	 * @param {number} scale - Scale factor (-1 to 2)
	 */
	setLeftXScale(scale) {
		this.leftXScale = Math.max(-1, Math.min(2, scale));
		if (this._leftXSlider) {
			this._leftXSlider.value = this.leftXScale;
		}
		if (this._leftXDisplay) {
			this._leftXDisplay.textContent = this.leftXScale.toFixed(2);
		}
		this.log(`Left X scale set to ${this.leftXScale.toFixed(2)}`);
		return this.leftXScale;
	}

	/**
	 * Set left stick Y axis scale
	 * @param {number} scale - Scale factor (-1 to 2)
	 */
	setLeftYScale(scale) {
		this.leftYScale = Math.max(-1, Math.min(2, scale));
		if (this._leftYSlider) {
			this._leftYSlider.value = this.leftYScale;
		}
		if (this._leftYDisplay) {
			this._leftYDisplay.textContent = this.leftYScale.toFixed(2);
		}
		this.log(`Left Y scale set to ${this.leftYScale.toFixed(2)}`);
		return this.leftYScale;
	}

	/**
	 * Set right stick X axis scale
	 * @param {number} scale - Scale factor (-1 to 2)
	 */
	setRightXScale(scale) {
		this.rightXScale = Math.max(-1, Math.min(2, scale));
		if (this._rightXSlider) {
			this._rightXSlider.value = this.rightXScale;
		}
		if (this._rightXDisplay) {
			this._rightXDisplay.textContent = this.rightXScale.toFixed(2);
		}
		this.log(`Right X scale set to ${this.rightXScale.toFixed(2)}`);
		return this.rightXScale;
	}

	/**
	 * Set right stick Y axis scale
	 * @param {number} scale - Scale factor (-1 to 2)
	 */
	setRightYScale(scale) {
		this.rightYScale = Math.max(-1, Math.min(2, scale));
		if (this._rightYSlider) {
			this._rightYSlider.value = this.rightYScale;
		}
		if (this._rightYDisplay) {
			this._rightYDisplay.textContent = this.rightYScale.toFixed(2);
		}
		this.log(`Right Y scale set to ${this.rightYScale.toFixed(2)}`);
		return this.rightYScale;
	}

	/**
	 * Set all scale factors to the same value
	 * @param {number} scale - Scale factor (-1 to 2)
	 */
	setAllScales(scale) {
		this.setLeftXScale(scale);
		this.setLeftYScale(scale);
		this.setRightXScale(scale);
		this.setRightYScale(scale);
		this.log(`All scales set to ${scale.toFixed(2)}`);
		return scale;
	}

	/**
	 * Reset all scale factors to 1.0
	 */
	resetScales() {
		this.setAllScales(1.0);
		this.log('All scales reset to 1.00');
	}

	_processInternal(state, deltaTime) {
		// Apply scaling to left stick
		state.analog.leftX = Math.max(-1, Math.min(1, state.analog.leftX * this.leftXScale));
		state.analog.leftY = Math.max(-1, Math.min(1, state.analog.leftY * this.leftYScale));

		// Apply scaling to right stick
		state.analog.rightX = Math.max(-1, Math.min(1, state.analog.rightX * this.rightXScale));
		state.analog.rightY = Math.max(-1, Math.min(1, state.analog.rightY * this.rightYScale));

		return state;
	}

	createControls() {
		const container = document.createElement('div');
		container.className = 'manipulator-controls analogscale-custom';

		// Main controls container
		const mainControls = document.createElement('div');
		mainControls.className = 'manipulator-control-group-horizontal';

		// Left stick controls
		const leftDiv = document.createElement('div');
		leftDiv.className = 'manipulator-control-fillwidth analogscale-columnwithgap';

		const leftTitle = document.createElement('h4');
		leftTitle.textContent = 'Left Stick';
		leftDiv.appendChild(leftTitle);

		// Left X control
		const leftXControl = this._createAxisControl('X (horizontal)', this.leftXScale, (value) => {
			this.executeAction('setLeftXScale', { scale: value });
		});
		this._leftXSlider = leftXControl.slider;
		this._leftXDisplay = leftXControl.display;
		leftDiv.appendChild(leftXControl.element);

		// Left Y control
		const leftYControl = this._createAxisControl('Y (vertical)', this.leftYScale, (value) => {
			this.executeAction('setLeftYScale', { scale: value });
		});
		this._leftYSlider = leftYControl.slider;
		this._leftYDisplay = leftYControl.display;
		leftDiv.appendChild(leftYControl.element);

		// Right stick controls
		const rightDiv = document.createElement('div');
		rightDiv.className = 'manipulator-control-fillwidth analogscale-columnwithgap';

		const rightTitle = document.createElement('h4');
		rightTitle.textContent = 'Right Stick';
		rightDiv.appendChild(rightTitle);

		// Right X control
		const rightXControl = this._createAxisControl('X (horizontal)', this.rightXScale, (value) => {
			this.executeAction('setRightXScale', { scale: value });
		});
		this._rightXSlider = rightXControl.slider;
		this._rightXDisplay = rightXControl.display;
		rightDiv.appendChild(rightXControl.element);

		// Right Y control
		const rightYControl = this._createAxisControl('Y (vertical)', this.rightYScale, (value) => {
			this.executeAction('setRightYScale', { scale: value });
		});
		this._rightYSlider = rightYControl.slider;
		this._rightYDisplay = rightYControl.display;
		rightDiv.appendChild(rightYControl.element);

		mainControls.appendChild(leftDiv);
		mainControls.appendChild(rightDiv);

		// Quick actions
		const actionsDiv = document.createElement('div');
		actionsDiv.className = 'quick-actions';

		const resetButton = document.createElement('button');
		resetButton.textContent = 'Reset All';
		resetButton.className = 'button small';
		resetButton.addEventListener('click', () => {
			this.executeAction('resetScales');
		});

		actionsDiv.appendChild(resetButton);

		// Assemble UI
		container.appendChild(mainControls);
		container.appendChild(actionsDiv);

		// Add custom styles
		const style = document.createElement('style');
		style.textContent = `
			.analogscale-columnwithgap {
				display: flex;
				flex-direction: column;
				gap: 1rem;
			}
			`
		container.appendChild(style);

			return container;
	}

	/**
	 * Create a control for a single axis
	 * @param {string} label - Axis label
	 * @param {number} initialValue - Initial scale value
	 * @param {Function} onChange - Callback when value changes
	 * @returns {Object} Object with element, slider, and display references
	 */
	_createAxisControl(label, initialValue, onChange) {
		const controlDiv = document.createElement('div');
		controlDiv.className = 'manipulator-control-fillwidth';

		const labelSpan = document.createElement('label');
		labelSpan.textContent = `${label}: `;

		const slider = document.createElement('input');
		slider.type = 'range';
		slider.min = '-1';
		slider.max = '2';
		slider.step = '0.05';
		slider.value = initialValue;
		slider.className = 'manipulator-control-fillwidth';

		const display = document.createElement('span');
		display.textContent = initialValue.toFixed(2);

		slider.addEventListener('input', () => {
			const value = parseFloat(slider.value);
			display.textContent = value.toFixed(2);
		});

		slider.addEventListener('change', () => {
			const value = parseFloat(slider.value);
			onChange(value);
		});

		controlDiv.appendChild(labelSpan);
		controlDiv.appendChild(slider);
		controlDiv.appendChild(display);

		return {
			element: controlDiv,
			slider: slider,
			display: display
		};
	}

	_getSpecificConfig() {
		return {
			leftXScale: this.leftXScale,
			leftYScale: this.leftYScale,
			rightXScale: this.rightXScale,
			rightYScale: this.rightYScale
		};
	}

	_setSpecificConfig(config) {
		if (config.leftXScale !== undefined) {
			this.setLeftXScale(config.leftXScale);
		}
		if (config.leftYScale !== undefined) {
			this.setLeftYScale(config.leftYScale);
		}
		if (config.rightXScale !== undefined) {
			this.setRightXScale(config.rightXScale);
		}
		if (config.rightYScale !== undefined) {
			this.setRightYScale(config.rightYScale);
		}
	}

	dispose() {
		super.dispose();
		this._leftXSlider = null;
		this._leftYSlider = null;
		this._rightXSlider = null;
		this._rightYSlider = null;
		this._leftXDisplay = null;
		this._leftYDisplay = null;
		this._rightXDisplay = null;
		this._rightYDisplay = null;
	}
}