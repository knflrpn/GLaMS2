/**
 * ./src/manipulators/Sticky.js
 *
 * Manipulator that maintains button states and analog stick peaks for a specified duration after press/peak.
 * When a button is pressed, it remains active for the sticky duration even after release.
 * For analog sticks, detects peaks and holds them for the duration, refreshing if within 5% of the peak.
 */
import { BaseManipulator } from './BaseManipulator.js';

/**
 * @typedef {Object} StickyParams
 * @property {number} [stickyDuration=500] - Duration to keep buttons/peaks active in milliseconds
 * @property {string[]} [stickyButtons=[]] - Array of button names to make sticky
 * @property {string[]} [stickyAxes=[]] - Array of analog axis names to make sticky
 */

export class Sticky extends BaseManipulator {
	static get defaultConfig() {
		return {
			stickyDuration: 500,
			stickyButtons: [],
			stickyAxes: [],
		};
	}

	static get displayName() {
		return "Sticky";
	}

	static get description() {
		return "Keep buttons active and analog peaks for a specified duration after press/peak.";
	}

	/**
	 * @param {StickyParams} params - Configuration parameters
	 */
	constructor(params = {}) {
		super(params);

		this.stickyDuration = params.stickyDuration || 500;
		this.stickyButtons = new Set(params.stickyButtons || []);
		this.stickyAxes = new Set(params.stickyAxes || []);
		this.peakThreshold = 0.1;

		// Button state tracking: buttonName -> { active: bool, timer: number }
		this.buttonStates = new Map();

		// Analog axis state tracking: axisName -> { peak: number, timer: number, active: bool }
		this.axisStates = new Map();

		// UI elements
		this._durationInput = null;
		this._buttonCheckboxes = new Map();
		this._axisCheckboxes = new Map();

		// Register sticky-specific actions
		this._registerStickyActions();
	}

	/**
	 * Register actions specific to the sticky manipulator
	 */
	_registerStickyActions() {
		// Existing button actions
		this.registerAction({
			name: 'setStickyDuration',
			displayName: 'Set Sticky Duration',
			description: 'Set the sticky duration in milliseconds',
			parameters: [
				{
					name: 'duration',
					type: 'number',
					description: 'Duration in milliseconds (50-5000)',
					required: true,
					default: 500
				}
			],
			handler: (params) => this.setStickyDuration(params.duration)
		});

		this.registerAction({
			name: 'addButton',
			displayName: 'Add Sticky Button',
			description: 'Add a button to the sticky list',
			parameters: [
				{
					name: 'buttonName',
					type: 'string',
					description: 'Name of the button (e.g., buttonA, dpadUp)',
					required: true
				}
			],
			handler: (params) => this.addButton(params.buttonName)
		});

		this.registerAction({
			name: 'removeButton',
			displayName: 'Remove Sticky Button',
			description: 'Remove a button from the sticky list',
			parameters: [
				{
					name: 'buttonName',
					type: 'string',
					description: 'Name of the button to remove',
					required: true
				}
			],
			handler: (params) => this.removeButton(params.buttonName)
		});

		this.registerAction({
			name: 'setButtons',
			displayName: 'Set Sticky Buttons',
			description: 'Set the complete list of sticky buttons',
			parameters: [
				{
					name: 'buttons',
					type: 'array',
					description: 'Array of button names',
					required: true
				}
			],
			handler: (params) => this.setButtons(params.buttons)
		});

		// New analog axis actions
		this.registerAction({
			name: 'addAxis',
			displayName: 'Add Sticky Axis',
			description: 'Add an analog axis to the sticky list',
			parameters: [
				{
					name: 'axisName',
					type: 'string',
					description: 'Name of the axis (leftX, leftY, rightX, rightY)',
					required: true
				}
			],
			handler: (params) => this.addAxis(params.axisName)
		});

		this.registerAction({
			name: 'removeAxis',
			displayName: 'Remove Sticky Axis',
			description: 'Remove an axis from the sticky list',
			parameters: [
				{
					name: 'axisName',
					type: 'string',
					description: 'Name of the axis to remove',
					required: true
				}
			],
			handler: (params) => this.removeAxis(params.axisName)
		});

		this.registerAction({
			name: 'setAxes',
			displayName: 'Set Sticky Axes',
			description: 'Set the complete list of sticky axes',
			parameters: [
				{
					name: 'axes',
					type: 'array',
					description: 'Array of axis names',
					required: true
				}
			],
			handler: (params) => this.setAxes(params.axes)
		});

		this.registerAction({
			name: 'getButtons',
			displayName: 'Get Sticky Buttons',
			description: 'Get the current list of sticky buttons',
			handler: () => Array.from(this.stickyButtons)
		});

		this.registerAction({
			name: 'getAxes',
			displayName: 'Get Sticky Axes',
			description: 'Get the current list of sticky axes',
			handler: () => Array.from(this.stickyAxes)
		});

		this.registerAction({
			name: 'clearButtons',
			displayName: 'Clear All Sticky Buttons',
			description: 'Remove all buttons from the sticky list',
			handler: () => this.clearButtons()
		});

		this.registerAction({
			name: 'clearAxes',
			displayName: 'Clear All Sticky Axes',
			description: 'Remove all axes from the sticky list',
			handler: () => this.clearAxes()
		});

		this.registerAction({
			name: 'enableAll',
			displayName: 'Enable All Buttons',
			description: 'Add all available buttons to sticky',
			handler: () => this.enableAllButtons()
		});

		this.registerAction({
			name: 'enableAllAxes',
			displayName: 'Enable All Axes',
			description: 'Add all available axes to sticky',
			handler: () => this.enableAllAxes()
		});

		this.registerAction({
			name: 'releaseAll',
			displayName: 'Release All Sticky States',
			description: 'Immediately release all currently sticky button and axis states',
			handler: () => this.releaseAllSticky()
		});
	}

	/**
	 * Set the sticky duration
	 * @param {number} duration - Duration in milliseconds (50-5000)
	 */
	setStickyDuration(duration) {
		const newDuration = Math.max(50, Math.min(5000, duration));
		this.stickyDuration = newDuration;

		if (this._durationInput) {
			this._durationInput.value = newDuration;
		}

		this.log(`Sticky duration set to ${newDuration}ms`);
		return newDuration;
	}

	/**
	 * Add a button to the sticky list
	 * @param {string} buttonName
	 */
	addButton(buttonName) {
		if (!buttonName) {
			throw new Error('Button name is required');
		}

		this.stickyButtons.add(buttonName);

		// Initialize button state if needed
		if (!this.buttonStates.has(buttonName)) {
			this.buttonStates.set(buttonName, { active: false, timer: 0 });
		}

		// Update UI if it exists
		const checkbox = this._buttonCheckboxes.get(buttonName);
		if (checkbox) {
			checkbox.checked = true;
		}

		this.log(`Added sticky to ${buttonName}`);
		return true;
	}

	/**
	 * Remove a button from the sticky list
	 * @param {string} buttonName
	 */
	removeButton(buttonName) {
		if (!buttonName) {
			throw new Error('Button name is required');
		}

		const removed = this.stickyButtons.delete(buttonName);
		if (removed) {
			// Clear button state
			this.buttonStates.delete(buttonName);

			// Update UI if it exists
			const checkbox = this._buttonCheckboxes.get(buttonName);
			if (checkbox) {
				checkbox.checked = false;
			}

			this.log(`Removed sticky from ${buttonName}`);
		}

		return removed;
	}

	/**
	 * Add an axis to the sticky list
	 * @param {string} axisName
	 */
	addAxis(axisName) {
		if (!axisName) {
			throw new Error('Axis name is required');
		}

		const validAxes = ['leftX', 'leftY', 'rightX', 'rightY'];
		if (!validAxes.includes(axisName)) {
			throw new Error(`Invalid axis name. Must be one of: ${validAxes.join(', ')}`);
		}

		this.stickyAxes.add(axisName);

		// Initialize axis state if needed
		if (!this.axisStates.has(axisName)) {
			this.axisStates.set(axisName, { peak: 0, timer: 0, active: false });
		}

		// Update UI if it exists
		const checkbox = this._axisCheckboxes.get(axisName);
		if (checkbox) {
			checkbox.checked = true;
		}

		this.log(`Added sticky to axis ${axisName}`);
		return true;
	}

	/**
	 * Remove an axis from the sticky list
	 * @param {string} axisName
	 */
	removeAxis(axisName) {
		if (!axisName) {
			throw new Error('Axis name is required');
		}

		const removed = this.stickyAxes.delete(axisName);
		if (removed) {
			// Clear axis state
			this.axisStates.delete(axisName);

			// Update UI if it exists
			const checkbox = this._axisCheckboxes.get(axisName);
			if (checkbox) {
				checkbox.checked = false;
			}

			this.log(`Removed sticky from axis ${axisName}`);
		}

		return removed;
	}

	/**
	 * Set the complete list of sticky buttons
	 * @param {string[]} buttons
	 */
	setButtons(buttons) {
		if (!Array.isArray(buttons)) {
			throw new Error('Buttons must be an array');
		}

		// Clear existing
		this.stickyButtons.clear();
		this.buttonStates.clear();

		// Add new buttons
		buttons.forEach(button => {
			this.stickyButtons.add(button);
			this.buttonStates.set(button, { active: false, timer: 0 });
		});

		// Update all checkboxes
		this._buttonCheckboxes.forEach((checkbox, buttonName) => {
			checkbox.checked = this.stickyButtons.has(buttonName);
		});

		this.log(`Set sticky buttons: ${buttons.join(', ')}`);
		return Array.from(this.stickyButtons);
	}

	/**
	 * Set the complete list of sticky axes
	 * @param {string[]} axes
	 */
	setAxes(axes) {
		if (!Array.isArray(axes)) {
			throw new Error('Axes must be an array');
		}

		const validAxes = ['leftX', 'leftY', 'rightX', 'rightY'];
		const invalidAxes = axes.filter(axis => !validAxes.includes(axis));
		if (invalidAxes.length > 0) {
			throw new Error(`Invalid axis names: ${invalidAxes.join(', ')}. Must be one of: ${validAxes.join(', ')}`);
		}

		// Clear existing
		this.stickyAxes.clear();
		this.axisStates.clear();

		// Add new axes
		axes.forEach(axis => {
			this.stickyAxes.add(axis);
			this.axisStates.set(axis, { peak: 0, timer: 0, active: false });
		});

		// Update all checkboxes
		this._axisCheckboxes.forEach((checkbox, axisName) => {
			checkbox.checked = this.stickyAxes.has(axisName);
		});

		this.log(`Set sticky axes: ${axes.join(', ')}`);
		return Array.from(this.stickyAxes);
	}

	/**
	 * Clear all sticky buttons
	 */
	clearButtons() {
		this.stickyButtons.clear();
		this.buttonStates.clear();

		// Update UI
		this._buttonCheckboxes.forEach(checkbox => {
			checkbox.checked = false;
		});

		this.log('Cleared all sticky buttons');
		return true;
	}

	/**
	 * Clear all sticky axes
	 */
	clearAxes() {
		this.stickyAxes.clear();
		this.axisStates.clear();

		// Update UI
		this._axisCheckboxes.forEach(checkbox => {
			checkbox.checked = false;
		});

		this.log('Cleared all sticky axes');
		return true;
	}

	/**
	 * Enable sticky for all available buttons
	 */
	enableAllButtons() {
		const allButtons = [
			'buttonA', 'buttonB', 'buttonX', 'buttonY',
			'dpadUp', 'dpadDown', 'dpadLeft', 'dpadRight',
			'buttonL', 'buttonR', 'buttonZL', 'buttonZR',
			'buttonThumbL', 'buttonThumbR'
		];

		allButtons.forEach(button => {
			this.stickyButtons.add(button);
			if (!this.buttonStates.has(button)) {
				this.buttonStates.set(button, { active: false, timer: 0 });
			}
		});

		// Update UI
		this._buttonCheckboxes.forEach((checkbox, buttonName) => {
			checkbox.checked = this.stickyButtons.has(buttonName);
		});

		this.log('Enabled sticky for all buttons');
		return Array.from(this.stickyButtons);
	}

	/**
	 * Enable sticky for all available axes
	 */
	enableAllAxes() {
		const allAxes = ['leftX', 'leftY', 'rightX', 'rightY'];

		allAxes.forEach(axis => {
			this.stickyAxes.add(axis);
			if (!this.axisStates.has(axis)) {
				this.axisStates.set(axis, { peak: 0, timer: 0, active: false });
			}
		});

		// Update UI
		this._axisCheckboxes.forEach((checkbox, axisName) => {
			checkbox.checked = this.stickyAxes.has(axisName);
		});

		this.log('Enabled sticky for all axes');
		return Array.from(this.stickyAxes);
	}

	/**
	 * Release all currently sticky button and axis states
	 */
	releaseAllSticky() {
		this.buttonStates.forEach(state => {
			state.active = false;
			state.timer = 0;
		});

		this.axisStates.forEach(state => {
			state.active = false;
			state.timer = 0;
			state.peak = 0;
		});

		this.log('Released all sticky button and axis states');
		return true;
	}

	_processInternal(state, deltaTime) {
		// Process each sticky button
		for (const buttonName of this.stickyButtons) {
			if (!(buttonName in state.digital)) continue;

			// Initialize button state if needed
			if (!this.buttonStates.has(buttonName)) {
				this.buttonStates.set(buttonName, { active: false, timer: 0 });
			}

			const buttonState = this.buttonStates.get(buttonName);
			const currentPressed = state.digital[buttonName];

			// If button is currently pressed, activate sticky state
			if (currentPressed) {
				buttonState.active = true;
				buttonState.timer = this.stickyDuration;
			}

			// Update timer if sticky is active
			if (buttonState.active && buttonState.timer > 0) {
				buttonState.timer -= deltaTime;

				if (buttonState.timer <= 0) {
					// Timer expired, deactivate sticky
					buttonState.active = false;
					buttonState.timer = 0;
				}
			}

			// Apply sticky state to output
			if (buttonState.active) {
				state.digital[buttonName] = true;
			}
		}

		// Process each sticky axis
		for (const axisName of this.stickyAxes) {
			if (!(axisName in state.analog)) continue;

			// Initialize axis state if needed
			if (!this.axisStates.has(axisName)) {
				this.axisStates.set(axisName, { peak: 0, timer: 0, active: false });
			}

			const axisState = this.axisStates.get(axisName);
			const currentValue = state.analog[axisName];
			const currentAbs = Math.abs(currentValue);

			// Check if current value exceeds threshold
			if (currentAbs >= this.peakThreshold) {
				// Determine the direction of current input
				const currentDirection = currentValue > 0 ? 1 : -1;

				// If no peak is currently set, allow setting in any direction
				if (!axisState.active || axisState.peak === 0) {
					// Set new peak
					axisState.peak = currentValue;
					axisState.timer = this.stickyDuration;
					axisState.active = true;
				} else {
					// Peak is already set, check if current input is in the same direction
					const peakDirection = axisState.peak > 0 ? 1 : -1;

					if (currentDirection === peakDirection) {
						// Same direction - allow updates
						const peakAbs = Math.abs(axisState.peak);
						const isNewPeak = currentAbs > peakAbs;
						const isWithinTolerance = Math.abs(currentAbs - peakAbs) <= 0.05;

						if (isNewPeak || isWithinTolerance) {
							// Update peak and reset timer
							axisState.peak = currentValue;
							axisState.timer = this.stickyDuration;
							axisState.active = true;
						}
					}
					// If currentDirection !== peakDirection, ignore the input
					// (don't update peak or timer)
				}
			}

			// Update timer if sticky is active
			if (axisState.active && axisState.timer > 0) {
				axisState.timer -= deltaTime;

				if (axisState.timer <= 0) {
					// Timer expired, deactivate sticky
					axisState.active = false;
					axisState.timer = 0;
					axisState.peak = 0;
				}
			}

			// Apply sticky state to output
			if (axisState.active) {
				state.analog[axisName] = axisState.peak;
			}
		}

		return state;
	}
	
	createControls() {
		const container = document.createElement('div');
		container.className = 'manipulator-controls sticky-custom';

		// Main settings
		const mainControls = document.createElement('div');
		mainControls.className = 'manipulator-control-group';

		// Sticky duration control
		const durationDiv = document.createElement('div');
		const durationLabel = document.createElement('label');
		durationLabel.textContent = 'Sticky Duration (ms): ';

		this._durationInput = document.createElement('input');
		this._durationInput.type = 'number';
		this._durationInput.min = '50';
		this._durationInput.max = '5000';
		this._durationInput.step = '50';
		this._durationInput.value = this.stickyDuration;
		this._durationInput.addEventListener('change', () => {
			const value = parseInt(this._durationInput.value) || 500;
			this.executeAction('setStickyDuration', { duration: value });
		});

		durationLabel.appendChild(this._durationInput);
		durationDiv.appendChild(durationLabel);

		mainControls.appendChild(durationDiv);

		// Button selection
		const buttonsDiv = document.createElement('div');
		buttonsDiv.className = 'manipulator-control-group';

		const buttonsLabel = document.createElement('p');
		buttonsLabel.textContent = 'Sticky Buttons:';

		// Define button groups
		const buttonGroups = [
			{
				title: 'Face Buttons',
				buttons: [
					{ name: 'buttonA', display: 'A' },
					{ name: 'buttonB', display: 'B' },
					{ name: 'buttonX', display: 'X' },
					{ name: 'buttonY', display: 'Y' }
				]
			},
			{
				title: 'D-Pad',
				buttons: [
					{ name: 'dpadUp', display: 'Up' },
					{ name: 'dpadDown', display: 'Down' },
					{ name: 'dpadLeft', display: 'Left' },
					{ name: 'dpadRight', display: 'Right' }
				]
			},
			{
				title: 'Shoulder',
				buttons: [
					{ name: 'buttonL', display: 'L' },
					{ name: 'buttonR', display: 'R' },
					{ name: 'buttonZL', display: 'ZL' },
					{ name: 'buttonZR', display: 'ZR' }
				]
			},
			{
				title: 'Sticks',
				buttons: [
					{ name: 'buttonThumbL', display: 'L3' },
					{ name: 'buttonThumbR', display: 'R3' }
				]
			}
		];

		// Create button grid
		const buttonGrid = document.createElement('div');
		buttonGrid.className = 'sticky-button-grid';

		buttonGroups.forEach(group => {
			const groupDiv = document.createElement('div');

			const groupTitle = document.createElement('p');
			groupTitle.textContent = group.title;
			groupDiv.appendChild(groupTitle);

			const groupButtons = document.createElement('div');

			group.buttons.forEach(button => {
				const buttonLabel = document.createElement('label');

				const checkbox = document.createElement('input');
				checkbox.type = 'checkbox';
				checkbox.checked = this.stickyButtons.has(button.name);
				checkbox.addEventListener('change', () => {
					if (checkbox.checked) {
						this.executeAction('addButton', { buttonName: button.name });
					} else {
						this.executeAction('removeButton', { buttonName: button.name });
					}
				});

				// Store reference to checkbox
				this._buttonCheckboxes.set(button.name, checkbox);

				const labelText = document.createElement('span');
				labelText.textContent = button.display;

				buttonLabel.appendChild(checkbox);
				buttonLabel.appendChild(labelText);
				groupButtons.appendChild(buttonLabel);
			});

			groupDiv.appendChild(groupButtons);
			buttonGrid.appendChild(groupDiv);
		});

		buttonsDiv.appendChild(buttonsLabel);
		buttonsDiv.appendChild(buttonGrid);

		// Analog axes selection
		const axesDiv = document.createElement('div');
		axesDiv.className = 'manipulator-control-group';

		const axesLabel = document.createElement('p');
		axesLabel.textContent = 'Sticky Analog Axes:';

		const axisGroups = [
			{
				title: 'Left Stick',
				axes: [
					{ name: 'leftX', display: 'Left X' },
					{ name: 'leftY', display: 'Left Y' }
				]
			},
			{
				title: 'Right Stick',
				axes: [
					{ name: 'rightX', display: 'Right X' },
					{ name: 'rightY', display: 'Right Y' }
				]
			}
		];

		// Create axis grid
		const axisGrid = document.createElement('div');
		axisGrid.className = 'sticky-axis-grid';

		axisGroups.forEach(group => {
			const groupDiv = document.createElement('div');

			const groupTitle = document.createElement('p');
			groupTitle.textContent = group.title;
			groupDiv.appendChild(groupTitle);

			const groupAxes = document.createElement('div');

			group.axes.forEach(axis => {
				const axisLabel = document.createElement('label');

				const checkbox = document.createElement('input');
				checkbox.type = 'checkbox';
				checkbox.checked = this.stickyAxes.has(axis.name);
				checkbox.addEventListener('change', () => {
					if (checkbox.checked) {
						this.executeAction('addAxis', { axisName: axis.name });
					} else {
						this.executeAction('removeAxis', { axisName: axis.name });
					}
				});

				// Store reference to checkbox
				this._axisCheckboxes.set(axis.name, checkbox);

				const labelText = document.createElement('span');
				labelText.textContent = axis.display;

				axisLabel.appendChild(checkbox);
				axisLabel.appendChild(labelText);
				groupAxes.appendChild(axisLabel);
			});

			groupDiv.appendChild(groupAxes);
			axisGrid.appendChild(groupDiv);
		});

		axesDiv.appendChild(axesLabel);
		axesDiv.appendChild(axisGrid);

		// Quick action buttons
		const quickActions = document.createElement('div');
		quickActions.className = 'quick-actions inline-with-gap';

		const selectAllBtn = document.createElement('button');
		selectAllBtn.textContent = 'All Buttons';
		selectAllBtn.className = 'button small';
		selectAllBtn.addEventListener('click', () => {
			this.executeAction('enableAll');
		});

		const selectAllAxesBtn = document.createElement('button');
		selectAllAxesBtn.textContent = 'All Axes';
		selectAllAxesBtn.className = 'button small';
		selectAllAxesBtn.addEventListener('click', () => {
			this.executeAction('enableAllAxes');
		});

		const clearAllBtn = document.createElement('button');
		clearAllBtn.textContent = 'Clear Buttons';
		clearAllBtn.className = 'button small';
		clearAllBtn.addEventListener('click', () => {
			this.executeAction('clearButtons');
		});

		const clearAllAxesBtn = document.createElement('button');
		clearAllAxesBtn.textContent = 'Clear Axes';
		clearAllAxesBtn.className = 'button small';
		clearAllAxesBtn.addEventListener('click', () => {
			this.executeAction('clearAxes');
		});

		const releaseAllBtn = document.createElement('button');
		releaseAllBtn.textContent = 'Release All';
		releaseAllBtn.className = 'button small';
		releaseAllBtn.addEventListener('click', () => {
			this.executeAction('releaseAll');
		});

		quickActions.appendChild(selectAllBtn);
		quickActions.appendChild(selectAllAxesBtn);
		quickActions.appendChild(clearAllBtn);
		quickActions.appendChild(clearAllAxesBtn);
		quickActions.appendChild(releaseAllBtn);

		// Assemble the UI
		container.appendChild(mainControls);
		container.appendChild(buttonsDiv);
		container.appendChild(axesDiv);
		container.appendChild(quickActions);

		// Add custom styles
		const style = document.createElement('style');
		style.textContent = `
			.sticky-button-grid {
				display: grid;
				grid-template-columns: repeat(4, 1fr);
				gap: 8px;
			}
			.sticky-axis-grid {
				display: grid;
				grid-template-columns: repeat(2, 1fr);
				gap: 8px;
			}
		`;
		container.appendChild(style);

		return container;
	}

	_getSpecificConfig() {
		return {
			stickyDuration: this.stickyDuration,
			stickyButtons: Array.from(this.stickyButtons),
			stickyAxes: Array.from(this.stickyAxes),
		};
	}

	_setSpecificConfig(config) {
		if (config.stickyDuration !== undefined) {
			this.setStickyDuration(config.stickyDuration);
		}

		if (config.stickyButtons !== undefined) {
			this.stickyButtons = new Set(config.stickyButtons);
			// Initialize button states for all sticky buttons
			this.buttonStates.clear();
			this.stickyButtons.forEach(buttonName => {
				this.buttonStates.set(buttonName, { active: false, timer: 0 });
			});
			// Update checkboxes if UI exists
			this._buttonCheckboxes.forEach((checkbox, buttonName) => {
				checkbox.checked = this.stickyButtons.has(buttonName);
			});
		}

		if (config.stickyAxes !== undefined) {
			this.stickyAxes = new Set(config.stickyAxes);
			// Initialize axis states for all sticky axes
			this.axisStates.clear();
			this.stickyAxes.forEach(axisName => {
				this.axisStates.set(axisName, { peak: 0, timer: 0, active: false });
			});
			// Update checkboxes if UI exists
			this._axisCheckboxes.forEach((checkbox, axisName) => {
				checkbox.checked = this.stickyAxes.has(axisName);
			});
		}
	}

	onEnabledChanged(enabled) {
		if (!enabled) {
			// Release all sticky states when disabled
			this.releaseAllSticky();
		}
	}

	onDetach() {
		super.onDetach();
		this.buttonStates.clear();
		this.axisStates.clear();
	}

	dispose() {
		super.dispose();
		this.buttonStates.clear();
		this.axisStates.clear();
		this._buttonCheckboxes.clear();
		this._axisCheckboxes.clear();
		this._durationInput = null;
	}
}