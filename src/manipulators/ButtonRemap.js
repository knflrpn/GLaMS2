/**
 * ./src/manipulators/Remap.js
 *
 * Manipulator that allows remapping any button(s) to any other button(s).
 * Uses a 14x14 grid interface where columns are input buttons and rows are output buttons.
 * 
 * Note: This file requires the accompanying CSS file: ./Remap.css
 */
import { ControllerState } from '../core/ControllerState.js';
import { BaseManipulator } from './BaseManipulator.js';

/**
 * @typedef {Object} RemapParams
 * @property {boolean} [enabled=true] - Whether this manipulator is active
 * @property {Object<string, string[]>} [mappings={}] - Button mappings (input -> output array)
 */

export class ButtonRemap extends BaseManipulator {
	static get defaultConfig() {
		return {
			mappings: {}
		};
	}
	static get displayName() {
		return "Button Remap";
	}

	/**
	 * @param {RemapParams} params - Configuration parameters
	 */
	constructor(params = {}) {
		super(params);

		// Define the button order for the grid
		this.buttons = [
			'buttonA', 'buttonB', 'buttonX', 'buttonY',
			'dpadUp', 'dpadDown', 'dpadLeft', 'dpadRight',
			'buttonL', 'buttonR', 'buttonZL', 'buttonZR',
			'buttonThumbL', 'buttonThumbR'
		];

		// Button display names for the UI
		this.buttonDisplayNames = {
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

		// Initialize mappings from params
		this.mappings = new Map();
		if (params.mappings) {
			Object.entries(params.mappings).forEach(([input, outputs]) => {
				this.mappings.set(input, new Set(outputs));
			});
		}

		// UI elements
		this._gridContainer = null;
		this._gridCells = new Map(); // "input,output" -> checkbox element

		// Register remap-specific actions
		this._registerRemapActions();
	}

	/**
	 * Register actions specific to the remap manipulator
	 */
	_registerRemapActions() {
		this.registerAction({
			name: 'mapButton',
			displayName: 'Map Button',
			description: 'Map an input button to an output button',
			parameters: [
				{
					name: 'input',
					type: 'string',
					description: 'Input button name',
					required: true
				},
				{
					name: 'output',
					type: 'string',
					description: 'Output button name',
					required: true
				}
			],
			handler: (params) => this.mapButton(params.input, params.output)
		});

		this.registerAction({
			name: 'unmapButton',
			displayName: 'Unmap Button',
			description: 'Remove a mapping from input to output button',
			parameters: [
				{
					name: 'input',
					type: 'string',
					description: 'Input button name',
					required: true
				},
				{
					name: 'output',
					type: 'string',
					description: 'Output button name',
					required: true
				}
			],
			handler: (params) => this.unmapButton(params.input, params.output)
		});

		this.registerAction({
			name: 'setMapping',
			displayName: 'Set Button Mapping',
			description: 'Set complete mapping for an input button',
			parameters: [
				{
					name: 'input',
					type: 'string',
					description: 'Input button name',
					required: true
				},
				{
					name: 'outputs',
					type: 'array',
					description: 'Array of output button names',
					required: true
				}
			],
			handler: (params) => this.setMapping(params.input, params.outputs)
		});

		this.registerAction({
			name: 'clearMapping',
			displayName: 'Clear Button Mapping',
			description: 'Clear all mappings for an input button',
			parameters: [
				{
					name: 'input',
					type: 'string',
					description: 'Input button name',
					required: true
				}
			],
			handler: (params) => this.clearMapping(params.input)
		});

		this.registerAction({
			name: 'clearAllMappings',
			displayName: 'Clear All Mappings',
			description: 'Remove all button mappings',
			handler: () => this.clearAllMappings()
		});

		this.registerAction({
			name: 'getMappings',
			displayName: 'Get Mappings',
			description: 'Get all current button mappings',
			handler: () => this.getMappings()
		});

		this.registerAction({
			name: 'setIdentityMapping',
			displayName: 'Set Identity Mapping',
			description: 'Set 1:1 mapping for all buttons (pass-through)',
			handler: () => this.setIdentityMapping()
		});

		this.registerAction({
			name: 'swapButtons',
			displayName: 'Swap Buttons',
			description: 'Swap the mappings of two buttons',
			parameters: [
				{
					name: 'button1',
					type: 'string',
					description: 'First button name',
					required: true
				},
				{
					name: 'button2',
					type: 'string',
					description: 'Second button name',
					required: true
				}
			],
			handler: (params) => this.swapButtons(params.button1, params.button2)
		});
	}

	/**
	 * Map an input button to an output button
	 * @param {string} input - Input button name
	 * @param {string} output - Output button name
	 */
	mapButton(input, output) {
		if (!this.buttons.includes(input) || !this.buttons.includes(output)) {
			throw new Error('Invalid button name');
		}

		if (!this.mappings.has(input)) {
			this.mappings.set(input, new Set());
		}

		this.mappings.get(input).add(output);

		// Update UI
		this._updateGridCell(input, output, true);

		this.log(`Mapped ${input} -> ${output}`);
		return true;
	}

	/**
	 * Remove a mapping from input to output button
	 * @param {string} input - Input button name
	 * @param {string} output - Output button name
	 */
	unmapButton(input, output) {
		if (!this.mappings.has(input)) {
			return false;
		}

		const removed = this.mappings.get(input).delete(output);

		// Clean up empty mappings
		if (this.mappings.get(input).size === 0) {
			this.mappings.delete(input);
		}

		if (removed) {
			// Update UI
			this._updateGridCell(input, output, false);
			this.log(`Unmapped ${input} -> ${output}`);
		}

		return removed;
	}

	/**
	 * Set complete mapping for an input button
	 * @param {string} input - Input button name
	 * @param {string[]} outputs - Array of output button names
	 */
	setMapping(input, outputs) {
		if (!this.buttons.includes(input)) {
			throw new Error('Invalid input button name');
		}

		if (!Array.isArray(outputs)) {
			throw new Error('Outputs must be an array');
		}

		// Validate all output buttons
		for (const output of outputs) {
			if (!this.buttons.includes(output)) {
				throw new Error(`Invalid output button name: ${output}`);
			}
		}

		// Clear existing mapping for this input
		this.clearMapping(input);

		// Set new mapping
		if (outputs.length > 0) {
			this.mappings.set(input, new Set(outputs));
		}

		// Update UI row
		this._updateGridRow(input);

		this.log(`Set mapping ${input} -> [${outputs.join(', ')}]`);
		return Array.from(this.mappings.get(input) || []);
	}

	/**
	 * Clear all mappings for an input button
	 * @param {string} input - Input button name
	 */
	clearMapping(input) {
		if (!this.buttons.includes(input)) {
			throw new Error('Invalid input button name');
		}

		const hadMapping = this.mappings.has(input);
		this.mappings.delete(input);

		if (hadMapping) {
			// Update UI row
			this._updateGridRow(input);
			this.log(`Cleared mapping for ${input}`);
		}

		return hadMapping;
	}

	/**
	 * Clear all button mappings
	 */
	clearAllMappings() {
		this.mappings.clear();

		// Update entire grid
		this._updateEntireGrid();

		this.log('Cleared all mappings');
		return true;
	}

	/**
	 * Get all current button mappings
	 */
	getMappings() {
		const result = {};
		this.mappings.forEach((outputs, input) => {
			result[input] = Array.from(outputs);
		});
		return result;
	}

	/**
	 * Set 1:1 identity mapping for all buttons
	 */
	setIdentityMapping() {
		this.mappings.clear();

		// Map each button to itself
		this.buttons.forEach(button => {
			this.mappings.set(button, new Set([button]));
		});

		// Update entire grid
		this._updateEntireGrid();

		this.log('Set identity mapping (1:1 pass-through)');
		return this.getMappings();
	}

	/**
	 * Swap the mappings of two buttons
	 * @param {string} button1 - First button name
	 * @param {string} button2 - Second button name
	 */
	swapButtons(button1, button2) {
		if (!this.buttons.includes(button1) || !this.buttons.includes(button2)) {
			throw new Error('Invalid button name');
		}

		const mapping1 = this.mappings.get(button1);
		const mapping2 = this.mappings.get(button2);

		// Clear both mappings
		this.mappings.delete(button1);
		this.mappings.delete(button2);

		// Set swapped mappings
		if (mapping2) {
			this.mappings.set(button1, new Set(mapping2));
		}
		if (mapping1) {
			this.mappings.set(button2, new Set(mapping1));
		}

		// Update UI rows
		this._updateGridRow(button1);
		this._updateGridRow(button2);

		this.log(`Swapped mappings: ${button1} <-> ${button2}`);
		return true;
	}

	/**
	 * Update a single grid cell
	 * @param {string} input - Input button name
	 * @param {string} output - Output button name
	 * @param {boolean} checked - Whether the cell should be checked
	 */
	_updateGridCell(input, output, checked) {
		const key = `${input},${output}`;
		const checkbox = this._gridCells.get(key);
		if (checkbox) {
			checkbox.checked = checked;
		}
	}

	/**
	 * Update an entire grid row
	 * @param {string} input - Input button name
	 */
	_updateGridRow(input) {
		const outputs = this.mappings.get(input) || new Set();

		this.buttons.forEach(output => {
			this._updateGridCell(input, output, outputs.has(output));
		});
	}

	/**
	 * Update the entire grid
	 */
	_updateEntireGrid() {
		this.buttons.forEach(input => {
			this._updateGridRow(input);
		});
	}

	_processInternal(state, deltaTime) {
		// Create a blank state for the output
		const newState = new ControllerState;

		// Apply mappings
		this.mappings.forEach((outputs, input) => {
			if (state.digital[input]) {
				// Input button is pressed, activate all mapped outputs
				outputs.forEach(output => {
					newState.digital[output] = true;
				});
			}
		});

		return newState;
	}

	createControls() {
		const container = document.createElement('div');
		container.className = 'manipulator-controls remap-custom';

		// Quick action buttons
		const quickActions = document.createElement('div');
		quickActions.className = 'remap-quick-actions';

		const identityBtn = document.createElement('button');
		identityBtn.textContent = 'Identity (1:1)';
		identityBtn.className = 'button remap-small';
		identityBtn.title = 'Set 1:1 pass-through mapping';
		identityBtn.addEventListener('click', () => {
			this.executeAction('setIdentityMapping');
		});

		const clearBtn = document.createElement('button');
		clearBtn.textContent = 'Clear All';
		clearBtn.className = 'button remap-small';
		clearBtn.addEventListener('click', () => {
			this.executeAction('clearAllMappings');
		});

		quickActions.appendChild(identityBtn);
		quickActions.appendChild(clearBtn);

		// Grid container
		this._gridContainer = document.createElement('div');
		this._gridContainer.className = 'remap-grid-container';

		// Create grid
		this._createGrid();

		container.appendChild(quickActions);
		container.appendChild(this._gridContainer);

		this.setIdentityMapping();

		// Add custom styles
		const style = document.createElement('style');
		style.textContent = `
			.remap-custom {
				padding: 10px;
			}

			.remap-custom .remap-grid-container {
				max-height: 800px;
			}

			.remap-custom .remap-grid {
				display: grid;
				gap: 1px;
				background-color: rgba(204, 204, 204, 0);
				margin: 0 auto;
				width: fit-content;
			}

			.remap-custom .remap-grid-corner {
				background-color: rgba(0,0,0,0);
				border: none;
			}

			.remap-custom .remap-grid-header {
				background-color: rgba(224, 224, 224, 0.1);
				color: white;
				text-align: center;
				font-size: 11px;
				font-weight: bold;
			}

			.remap-custom .remap-column-header {
				min-height: 30px;
				min-width: 25px;
				display: flex;
				align-items: center;
				justify-content: center;
			}

			.remap-custom .remap-row-header {
				min-height: 25px;
				min-width: 30px;
				display: flex;
				align-items: center;
				justify-content: center;
			}

			.remap-custom .remap-grid-cell {
				background-color: rgba(255, 255, 255, 0.05);
				text-align: center;
				min-height: 25px;
				min-width: 25px;
				display: flex;
				align-items: center;
				justify-content: center;
			}

			.remap-custom .remap-grid-cell:hover {
				background-color: #f5f5f5;
			}

			.remap-custom .remap-grid input[type="checkbox"] {
				margin: 0 !important;
				height: 100%;
				width: 100%;
				cursor: pointer;
			}

			.remap-custom .remap-grid input[type="checkbox"]:checked::after {
				content: '';
			}

			.remap-custom .remap-grid input[type="checkbox"]:checked {
				background: linear-gradient(135deg, #888aff, #dbccff);
				border: 2px solid #d4caff;
			}

			.remap-custom .remap-legend {
				background-color: #f8f9fa;
				border: 1px solid #dee2e6;
				border-radius: 4px;
				padding: 10px;
				margin-bottom: 15px;
				font-size: 12px;
			}

			.remap-custom .remap-legend-item {
				margin-bottom: 5px;
			}

			.remap-custom .remap-legend-item:last-child {
				margin-bottom: 0;
			}

			.remap-custom .remap-quick-actions {
				display: flex;
				gap: 10px;
				margin-bottom: 15px;
				flex-wrap: wrap;
			}

			.remap-custom .remap-button.remap-small {
				padding: 6px 12px;
				font-size: 12px;
				border-radius: 4px;
				cursor: pointer;
				transition: background-color 0.2s;
			}
		`;
		container.appendChild(style);

		return container;
	}

	/**
	 * Create the 14x14 grid
	 */
	_createGrid() {
		const grid = document.createElement('div');
		grid.className = 'remap-grid';

		// Set up CSS grid
		grid.style.gridTemplateColumns = `repeat(${this.buttons.length}, 1fr) auto`;
		grid.style.gridTemplateRows = `auto repeat(${this.buttons.length}, 1fr)`;

		// Top headers (input buttons)
		this.buttons.forEach(button => {
			const header = document.createElement('div');
			header.className = 'remap-grid-header remap-column-header';
			header.textContent = this.buttonDisplayNames[button];
			header.title = `Input: ${button}`;
			grid.appendChild(header);
		});

		// Top-right corner (empty)
		const corner = document.createElement('div');
		corner.className = 'remap-grid-corner';
		grid.appendChild(corner);

		// Grid rows
		this.buttons.forEach(outputButton => {
			// Grid cells for this row
			this.buttons.forEach(inputButton => {
				const cell = document.createElement('div');
				cell.className = 'remap-grid-cell';

				const checkbox = document.createElement('input');
				checkbox.type = 'checkbox';

				// Check if this mapping exists
				const outputs = this.mappings.get(inputButton);
				checkbox.checked = outputs ? outputs.has(outputButton) : false;

				// Add event listener
				checkbox.addEventListener('change', () => {
					if (checkbox.checked) {
						this.executeAction('mapButton', {
							input: inputButton,
							output: outputButton
						});
					} else {
						this.executeAction('unmapButton', {
							input: inputButton,
							output: outputButton
						});
					}
				});

				// Store reference
				const key = `${inputButton},${outputButton}`;
				this._gridCells.set(key, checkbox);

				cell.appendChild(checkbox);
				grid.appendChild(cell);
			});

			// Row header (output button) - on the right
			const rowHeader = document.createElement('div');
			rowHeader.className = 'remap-grid-header remap-row-header';
			rowHeader.textContent = this.buttonDisplayNames[outputButton];
			rowHeader.title = `Output: ${outputButton}`;
			grid.appendChild(rowHeader);
		});

		this._gridContainer.appendChild(grid);
	}

	_getSpecificConfig() {
		const mappings = {};
		this.mappings.forEach((outputs, input) => {
			mappings[input] = Array.from(outputs);
		});

		return {
			mappings
		};
	}

	_setSpecificConfig(config) {
		if (config.mappings !== undefined) {
			this.mappings.clear();
			Object.entries(config.mappings).forEach(([input, outputs]) => {
				if (Array.isArray(outputs)) {
					this.mappings.set(input, new Set(outputs));
				}
			});

			// Update UI if it exists
			if (this._gridContainer) {
				this._updateEntireGrid();
			}
		}
	}

	dispose() {
		super.dispose();
		this._gridCells.clear();
		this._gridContainer = null;
	}
}