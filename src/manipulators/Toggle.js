/**
 * ./src/manipulators/Toggle.js
 *
 * Manipulator that toggles button states on/off with each press.
 * Press once to turn on, press again to turn off.
 * Only works with digital buttons, not analog sticks.
 */
import { BaseManipulator } from './BaseManipulator.js';

/**
 * @typedef {Object} ToggleParams
 * @property {string[]} [toggleButtons=[]] - Array of button names to make toggleable
 */

export class Toggle extends BaseManipulator {
	static get defaultConfig() {
		return {
			toggleButtons: [],
		};
	}

	static get displayName() {
		return "Toggle";
	}

	static get description() {
		return "Toggle button states on/off with each press. Press once to turn on, press again to turn off.";
	}

	/**
	 * @param {ToggleParams} params - Configuration parameters
	 */
	constructor(params = {}) {
		super(params);

		this.toggleButtons = new Set(params.toggleButtons || []);

		// Button state tracking: buttonName -> { toggled: bool, lastPressed: bool }
		this.buttonStates = new Map();

		// UI elements
		this._buttonCheckboxes = new Map();

		// Register toggle-specific actions
		this._registerToggleActions();
	}

	/**
	 * Register actions specific to the toggle manipulator
	 */
	_registerToggleActions() {
		this.registerAction({
			name: 'addButton',
			displayName: 'Add Toggle Button',
			description: 'Add a button to the toggle list',
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
			displayName: 'Remove Toggle Button',
			description: 'Remove a button from the toggle list',
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
			displayName: 'Set Toggle Buttons',
			description: 'Set the complete list of toggle buttons',
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

		this.registerAction({
			name: 'getButtons',
			displayName: 'Get Toggle Buttons',
			description: 'Get the current list of toggle buttons',
			handler: () => Array.from(this.toggleButtons)
		});

		this.registerAction({
			name: 'clearButtons',
			displayName: 'Clear All Toggle Buttons',
			description: 'Remove all buttons from the toggle list',
			handler: () => this.clearButtons()
		});

		this.registerAction({
			name: 'enableAll',
			displayName: 'Enable All Buttons',
			description: 'Add all available buttons to toggle',
			handler: () => this.enableAllButtons()
		});

		this.registerAction({
			name: 'toggleButton',
			displayName: 'Toggle Specific Button',
			description: 'Manually toggle a specific button state',
			parameters: [
				{
					name: 'buttonName',
					type: 'string',
					description: 'Name of the button to toggle',
					required: true
				}
			],
			handler: (params) => this.toggleButton(params.buttonName)
		});

		this.registerAction({
			name: 'setButtonState',
			displayName: 'Set Button State',
			description: 'Set a specific button to on or off',
			parameters: [
				{
					name: 'buttonName',
					type: 'string',
					description: 'Name of the button',
					required: true
				},
				{
					name: 'state',
					type: 'boolean',
					description: 'True for on, false for off',
					required: true
				}
			],
			handler: (params) => this.setButtonState(params.buttonName, params.state)
		});

		this.registerAction({
			name: 'resetAll',
			displayName: 'Reset All Toggle States',
			description: 'Turn off all currently toggled buttons',
			handler: () => this.resetAllToggleStates()
		});

		this.registerAction({
			name: 'getToggleStates',
			displayName: 'Get Toggle States',
			description: 'Get the current toggle state of all buttons',
			handler: () => this.getToggleStates()
		});
	}

	/**
	 * Add a button to the toggle list
	 * @param {string} buttonName
	 */
	addButton(buttonName) {
		if (!buttonName) {
			throw new Error('Button name is required');
		}

		this.toggleButtons.add(buttonName);

		// Initialize button state if needed
		if (!this.buttonStates.has(buttonName)) {
			this.buttonStates.set(buttonName, { toggled: false, lastPressed: false });
		}

		// Update UI if it exists
		const checkbox = this._buttonCheckboxes.get(buttonName);
		if (checkbox) {
			checkbox.checked = true;
		}

		this.log(`Added toggle to ${buttonName}`);
		return true;
	}

	/**
	 * Remove a button from the toggle list
	 * @param {string} buttonName
	 */
	removeButton(buttonName) {
		if (!buttonName) {
			throw new Error('Button name is required');
		}

		const removed = this.toggleButtons.delete(buttonName);
		if (removed) {
			// Clear button state
			this.buttonStates.delete(buttonName);

			// Update UI if it exists
			const checkbox = this._buttonCheckboxes.get(buttonName);
			if (checkbox) {
				checkbox.checked = false;
			}

			this.log(`Removed toggle from ${buttonName}`);
		}

		return removed;
	}

	/**
	 * Set the complete list of toggle buttons
	 * @param {string[]} buttons
	 */
	setButtons(buttons) {
		if (!Array.isArray(buttons)) {
			throw new Error('Buttons must be an array');
		}

		// Clear existing
		this.toggleButtons.clear();
		this.buttonStates.clear();

		// Add new buttons
		buttons.forEach(button => {
			this.toggleButtons.add(button);
			this.buttonStates.set(button, { toggled: false, lastPressed: false });
		});

		// Update all checkboxes
		this._buttonCheckboxes.forEach((checkbox, buttonName) => {
			checkbox.checked = this.toggleButtons.has(buttonName);
		});

		this.log(`Set toggle buttons: ${buttons.join(', ')}`);
		return Array.from(this.toggleButtons);
	}

	/**
	 * Clear all toggle buttons
	 */
	clearButtons() {
		this.toggleButtons.clear();
		this.buttonStates.clear();

		// Update UI
		this._buttonCheckboxes.forEach(checkbox => {
			checkbox.checked = false;
		});

		this.log('Cleared all toggle buttons');
		return true;
	}

	/**
	 * Enable toggle for all available buttons
	 */
	enableAllButtons() {
		const allButtons = [
			'buttonA', 'buttonB', 'buttonX', 'buttonY',
			'dpadUp', 'dpadDown', 'dpadLeft', 'dpadRight',
			'buttonL', 'buttonR', 'buttonZL', 'buttonZR',
			'buttonThumbL', 'buttonThumbR'
		];

		allButtons.forEach(button => {
			this.toggleButtons.add(button);
			if (!this.buttonStates.has(button)) {
				this.buttonStates.set(button, { toggled: false, lastPressed: false });
			}
		});

		// Update UI
		this._buttonCheckboxes.forEach((checkbox, buttonName) => {
			checkbox.checked = this.toggleButtons.has(buttonName);
		});

		this.log('Enabled toggle for all buttons');
		return Array.from(this.toggleButtons);
	}

	/**
	 * Manually toggle a specific button state
	 * @param {string} buttonName
	 */
	toggleButton(buttonName) {
		if (!this.toggleButtons.has(buttonName)) {
			throw new Error(`Button ${buttonName} is not in the toggle list`);
		}

		// Initialize if needed
		if (!this.buttonStates.has(buttonName)) {
			this.buttonStates.set(buttonName, { toggled: false, lastPressed: false });
		}

		const buttonState = this.buttonStates.get(buttonName);
		buttonState.toggled = !buttonState.toggled;

		this.log(`Manually toggled ${buttonName} to ${buttonState.toggled ? 'ON' : 'OFF'}`);
		return buttonState.toggled;
	}

	/**
	 * Set a specific button to on or off
	 * @param {string} buttonName
	 * @param {boolean} state
	 */
	setButtonState(buttonName, state) {
		if (!this.toggleButtons.has(buttonName)) {
			throw new Error(`Button ${buttonName} is not in the toggle list`);
		}

		// Initialize if needed
		if (!this.buttonStates.has(buttonName)) {
			this.buttonStates.set(buttonName, { toggled: false, lastPressed: false });
		}

		const buttonState = this.buttonStates.get(buttonName);
		buttonState.toggled = Boolean(state);

		this.log(`Set ${buttonName} to ${buttonState.toggled ? 'ON' : 'OFF'}`);
		return buttonState.toggled;
	}

	/**
	 * Reset all toggle states to off
	 */
	resetAllToggleStates() {
		this.buttonStates.forEach(state => {
			state.toggled = false;
			state.lastPressed = false;
		});

		this.log('Reset all toggle states to OFF');
		return true;
	}

	/**
	 * Get the current toggle state of all buttons
	 */
	getToggleStates() {
		const states = {};
		this.buttonStates.forEach((state, buttonName) => {
			states[buttonName] = state.toggled;
		});
		return states;
	}

	_processInternal(state, deltaTime) {
		// Process each toggle button
		for (const buttonName of this.toggleButtons) {
			if (!(buttonName in state.digital)) continue;

			// Initialize button state if needed
			if (!this.buttonStates.has(buttonName)) {
				this.buttonStates.set(buttonName, { toggled: false, lastPressed: false });
			}

			const buttonState = this.buttonStates.get(buttonName);
			const currentPressed = state.digital[buttonName];

			// Detect button press (rising edge)
			if (currentPressed && !buttonState.lastPressed) {
				// Button was just pressed, toggle the state
				buttonState.toggled = !buttonState.toggled;
				this.log(`${buttonName} toggled ${buttonState.toggled ? 'ON' : 'OFF'}`);
			}

			// Update last pressed state for next frame
			buttonState.lastPressed = currentPressed;

			// Apply toggle state to output
			if (buttonState.toggled) {
				state.digital[buttonName] = true;
			}
		}

		return state;
	}

	createControls() {
		const container = document.createElement('div');
		container.className = 'manipulator-controls toggle-custom';

		// Button selection
		const buttonsDiv = document.createElement('div');
		buttonsDiv.className = 'manipulator-control-group';

		const buttonsLabel = document.createElement('p');
		buttonsLabel.textContent = 'Toggle Buttons:';

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
		buttonGrid.className = 'toggle-button-grid';

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
				checkbox.checked = this.toggleButtons.has(button.name);
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

		// Quick action buttons
		const quickActions = document.createElement('div');
		quickActions.className = 'quick-actions inline-with-gap';

		const selectAllBtn = document.createElement('button');
		selectAllBtn.textContent = 'All Buttons';
		selectAllBtn.className = 'button small';
		selectAllBtn.addEventListener('click', () => {
			this.executeAction('enableAll');
		});

		const clearAllBtn = document.createElement('button');
		clearAllBtn.textContent = 'No Buttons';
		clearAllBtn.className = 'button small';
		clearAllBtn.addEventListener('click', () => {
			this.executeAction('clearButtons');
		});

		const resetStatesBtn = document.createElement('button');
		resetStatesBtn.textContent = 'Reset States';
		resetStatesBtn.className = 'button small';
		resetStatesBtn.addEventListener('click', () => {
			this.executeAction('resetAll');
		});

		quickActions.appendChild(selectAllBtn);
		quickActions.appendChild(clearAllBtn);
		quickActions.appendChild(resetStatesBtn);

		// Assemble the UI
		container.appendChild(buttonsDiv);
		container.appendChild(quickActions);

		// Add custom styles
		const style = document.createElement('style');
		style.textContent = `
			.toggle-button-grid {
				display: grid;
				grid-template-columns: repeat(4, 1fr);
				gap: 8px;
			}
			.toggle-states-display {
				padding: 8px;
				border-radius: 4px;
				background-color: #f0f0f0;
				color: #666;
				font-style: italic;
			}
			.toggle-states-display.active {
				background-color: #e8f5e8;
				color: #2d5016;
				font-style: normal;
				font-weight: bold;
			}
		`;
		container.appendChild(style);

		return container;
	}

	_getSpecificConfig() {
		return {
			toggleButtons: Array.from(this.toggleButtons),
		};
	}

	_setSpecificConfig(config) {
		if (config.toggleButtons !== undefined) {
			this.toggleButtons = new Set(config.toggleButtons);
			// Initialize button states for all toggle buttons
			this.buttonStates.clear();
			this.toggleButtons.forEach(buttonName => {
				this.buttonStates.set(buttonName, { toggled: false, lastPressed: false });
			});
			// Update checkboxes if UI exists
			this._buttonCheckboxes.forEach((checkbox, buttonName) => {
				checkbox.checked = this.toggleButtons.has(buttonName);
			});
		}
	}

	onEnabledChanged(enabled) {
		if (!enabled) {
			// Reset all toggle states when disabled
			this.resetAllToggleStates();
		}
	}

	onDetach() {
		super.onDetach();
		this.buttonStates.clear();
	}

	dispose() {
		super.dispose();
		this.buttonStates.clear();
		this._buttonCheckboxes.clear();
	}
}