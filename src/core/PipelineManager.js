// ./src/core/PipelineManager.js

import { ManipulatorPipeline } from '../manipulators/ManipulatorPipeline.js';

/**
 * PipelineManager handles all manipulator pipeline operations
 * Manages manipulator creation, removal, ordering, and UI integration
 */
export class PipelineManager {
	constructor(pipeline, uiManager) {
		this.pipeline = pipeline;
		this.uiManager = uiManager;
		this.pipelineContainer = this.uiManager.elements.pipelineContainer;

		this.setupEventListeners();
		this.setupPipelineEventListeners();
		this.generateManipulatorButtons();
	}

	/**
	 * Setup event listeners for pipeline controls
	 */
	setupEventListeners() {
		// Toggle pipeline controls visibility
		this.uiManager.addEventListenerSafe('toggleControlsBtn', 'click', () => {
			this.uiManager.togglePipelineControls();
		});

		// Clear pipeline button
		this.uiManager.addEventListenerSafe('clearPipelineBtn', 'click', () => {
			this.clearPipeline();
		});
	}

	/**
	 * Setup event listeners for pipeline events
	 */
	setupPipelineEventListeners() {
		this.pipeline.on('registered', (data) => {
			const id = this.pipeline.getId(data.manipulator);
			this.uiManager.logMessage(`Manipulator registered: ${data.manipulator.constructor.displayName}`);
			this.onPipelineChanged();
		});

		this.pipeline.on('unregistered', (data) => {
			this.uiManager.logMessage(`Manipulator unregistered: ${data.manipulator.constructor.displayName} ${data.previousIndex}`);
			this.onPipelineChanged();
		});

		this.pipeline.on('moved', (data) => {
			this.uiManager.logMessage(`Manipulator moved: ${data.manipulator.constructor.displayName} from ${data.fromIndex} to ${data.toIndex}`);
			this.onPipelineChanged();
		});

		this.pipeline.on('actionExecuted', (data) => {
			this.uiManager.logMessage(`Action executed: ${data.actionName} on ${data.manipulator.constructor.displayName}`);
		});
	}

	/**
	 * Generate manipulator buttons dynamically based on registry
	 */
	generateManipulatorButtons() {
		const pipelineControls = this.uiManager.elements.pipelineControls;

		// Clear existing buttons
		pipelineControls.innerHTML = '';

		// Create a button for each registered manipulator type
		for (const manipulatorType of ManipulatorPipeline.MANIPULATOR_REGISTRY) {
			const button = this.uiManager.createButton(
				manipulatorType.displayName,
				'button',
				() => this.addManipulator(manipulatorType.name)
			);
			pipelineControls.appendChild(button);
		}
	}

	/**
	 * Add a manipulator to the pipeline
	 * @param {string} type - Manipulator type name
	 * @param {Object} customConfig - Custom configuration for the manipulator
	 * @returns {Object|null} Created manipulator instance or null if failed
	 */
	addManipulator(type, customConfig = {}) {
		try {
			// Find the manipulator constructor
			const ManipulatorClass = ManipulatorPipeline.MANIPULATOR_REGISTRY.find(c => c.name === type);
			if (!ManipulatorClass) {
				this.uiManager.logMessage(`Unknown manipulator type: ${type}`);
				return null;
			}

			// Create manipulator instance
			const manipulator = new ManipulatorClass(customConfig);
			manipulator.setLogger((msg) => this.uiManager.logMessage(msg));

			// Add to pipeline (this will trigger the 'registered' event)
			this.pipeline.add(manipulator);

			// Add to UI
			this.addManipulatorToUI(manipulator);

			this.uiManager.logMessage(`Added ${manipulator.constructor.displayName}`);
			return manipulator;

		} catch (error) {
			this.uiManager.logMessage(`Error adding manipulator ${type}: ${error.message}`);
			return null;
		}
	}

	/**
	 * Add manipulator UI to the pipeline container
	 * @param {Object} manipulator - Manipulator instance
	 */
	addManipulatorToUI(manipulator) {
		// Create UI container
		const manipulatorDiv = document.createElement('div');
		manipulatorDiv.className = 'manipulator-wrapper';

		// Create the manipulator's UI content
		manipulator.createUI(manipulatorDiv);

		// Add control footer
		const controlsDiv = this.createManipulatorControls(manipulator, manipulatorDiv);
		manipulatorDiv.appendChild(controlsDiv);

		// Add to pipeline container
		this.pipelineContainer.appendChild(manipulatorDiv);

		// Store reference for cleanup
		manipulator._uiElement = manipulatorDiv;

		// Trigger pipeline change event
		this.onPipelineChanged();
	}

	/**
	 * Create control buttons for a manipulator
	 * @param {Object} manipulator - Manipulator instance
	 * @param {HTMLElement} manipulatorDiv - Manipulator UI container
	 * @returns {HTMLElement} Controls container
	 */
	createManipulatorControls(manipulator, manipulatorDiv) {
		const controlsDiv = document.createElement('div');
		controlsDiv.className = 'manipulator-footer';

		// Move Up button
		const moveUpBtn = this.uiManager.createButton(
			'⬆️ Up',
			'button small',
			() => {
				this.moveManipulator(manipulator, manipulatorDiv, -1);
				this.onPipelineChanged();
			}
		);

		// Move Down button
		const moveDownBtn = this.uiManager.createButton(
			'⬇️ Down',
			'button small',
			() => {
				this.moveManipulator(manipulator, manipulatorDiv, 1);
				this.onPipelineChanged();
			}
		);

		// Remove button
		const removeBtn = this.uiManager.createButton(
			'Remove',
			'button danger small',
			() => {
				this.removeManipulator(manipulator, manipulatorDiv);
				this.onPipelineChanged();
			}
		);

		controlsDiv.appendChild(moveUpBtn);
		controlsDiv.appendChild(moveDownBtn);
		controlsDiv.appendChild(removeBtn);

		return controlsDiv;
	}

	/**
	 * Remove a manipulator from the pipeline
	 * @param {Object} manipulator - Manipulator instance
	 * @param {HTMLElement} uiElement - UI element to remove
	 */
	removeManipulator(manipulator, uiElement) {
		try {
			// Remove from pipeline (this will trigger the 'unregistered' event)
			this.pipeline.remove(manipulator);

			// Remove from UI
			if (uiElement && uiElement.parentNode) {
				uiElement.parentNode.removeChild(uiElement);
			}

			// Cleanup manipulator
			if (manipulator.dispose) {
				manipulator.dispose();
			}

			this.uiManager.logMessage(`Removed ${manipulator.constructor.displayName}`);

		} catch (error) {
			this.uiManager.logMessage(`Error removing manipulator: ${error.message}`);
		}
	}

	/**
	 * Move a manipulator up or down in the pipeline
	 * @param {Object} manipulator - Manipulator instance
	 * @param {HTMLElement} uiElement - UI element to move
	 * @param {number} direction - Direction to move (-1 for up, 1 for down)
	 */
	moveManipulator(manipulator, uiElement, direction) {
		try {
			const allManipulators = this.pipeline.getManipulators();
			const currentIndex = allManipulators.indexOf(manipulator);
			const newIndex = currentIndex + direction;

			// Check bounds
			if (newIndex < 0 || newIndex >= allManipulators.length) {
				return;
			}

			// Move in pipeline (this will trigger the 'moved' event)
			this.pipeline.move(manipulator, newIndex);

			// Move in UI
			this.moveManipulatorUI(uiElement, direction, newIndex);

			// Log with position info
			const id = this.pipeline.getId(manipulator);
			this.uiManager.logMessage(`Moved ${manipulator.constructor.displayName} ${direction > 0 ? 'down' : 'up'} to position ${newIndex} (${id})`);

		} catch (error) {
			this.uiManager.logMessage(`Error moving manipulator: ${error.message}`);
		}
	}

	/**
	 * Move manipulator UI element in the DOM
	 * @param {HTMLElement} uiElement - Element to move
	 * @param {number} direction - Direction to move (-1 for up, 1 for down)
	 * @param {number} newIndex - New index position
	 */
	moveManipulatorUI(uiElement, direction, newIndex) {
		const container = this.pipelineContainer;
		const allElements = Array.from(container.children).filter(el =>
			el.classList.contains('manipulator-wrapper'));

		if (direction > 0) {
			// Moving down - insert after the element at newIndex
			if (newIndex >= allElements.length - 1) {
				// Moving to the end
				container.appendChild(uiElement);
			} else {
				// Insert after the element that's currently at newIndex
				const targetElement = allElements[newIndex];
				if (targetElement.nextSibling) {
					container.insertBefore(uiElement, targetElement.nextSibling);
				} else {
					container.appendChild(uiElement);
				}
			}
		} else {
			// Moving up - insert before the element at newIndex
			const targetElement = allElements[newIndex];
			container.insertBefore(uiElement, targetElement);
		}
	}

	/**
	 * Clear all manipulators from the pipeline
	 */
	clearPipeline() {
		try {
			// Get all manipulators from pipeline
			const allManipulators = this.pipeline.getManipulators().slice(); // Create copy

			// Remove each manipulator
			allManipulators.forEach(manipulator => {
				this.removeManipulator(manipulator, manipulator._uiElement);
			});

			// Clear container (in case any elements remain)
			this.uiManager.clearPipelineContainer();

			this.uiManager.logMessage('Pipeline cleared');
			this.onPipelineChanged();

		} catch (error) {
			this.uiManager.logMessage(`Error clearing pipeline: ${error.message}`);
		}
	}

	/**
	 * Get current pipeline configuration for saving
	 * @returns {Array} Pipeline configuration array
	 */
	getCurrentConfig() {
		try {
			return this.pipeline.getManipulators().map(manipulator => ({
				type: manipulator.constructor.name,
				config: manipulator.getConfig ? manipulator.getConfig() : {}
			}));
		} catch (error) {
			this.uiManager.logMessage(`Error getting pipeline config: ${error.message}`);
			return [];
		}
	}

	/**
	 * Load a pipeline configuration
	 * @param {Array} config - Pipeline configuration array
	 */
	loadConfig(config) {
		try {
			// Clear existing pipeline
			this.clearPipeline();

			// Load each manipulator
			config.forEach(({ type, config: manipulatorConfig }) => {
				this.addManipulator(type, manipulatorConfig);
			});

			this.uiManager.logMessage(`Loaded pipeline with ${config.length} manipulator(s)`);

		} catch (error) {
			this.uiManager.logMessage(`Error loading pipeline config: ${error.message}`);
		}
	}

	/**
	 * Execute an action on a specific manipulator
	 * @param {string} manipulatorId - Manipulator ID
	 * @param {string} actionName - Action name to execute
	 * @param {Object} params - Action parameters
	 * @returns {*} Action result
	 */
	executeAction(manipulatorId, actionName, params) {
		try {
			const result = this.pipeline.executeAction(manipulatorId, actionName, params);
			this.uiManager.logMessage(`Executed ${actionName} on ${manipulatorId}: ${JSON.stringify(result)}`);
			return result;
		} catch (error) {
			this.uiManager.logMessage(`Action error: ${error.message}`);
			throw error;
		}
	}

	/**
	 * Get manipulator by ID
	 * @param {string} id - Manipulator ID
	 * @returns {Object|null} Manipulator instance or null if not found
	 */
	getManipulatorById(id) {
		try {
			const manipulators = this.pipeline.getManipulators();
			return manipulators.find(m => this.pipeline.getId(m) === id) || null;
		} catch (error) {
			this.uiManager.logMessage(`Error getting manipulator by ID: ${error.message}`);
			return null;
		}
	}

	/**
	 * Get all manipulators in the pipeline
	 * @returns {Array} Array of manipulator instances
	 */
	getAllManipulators() {
		try {
			return this.pipeline.getManipulators();
		} catch (error) {
			this.uiManager.logMessage(`Error getting all manipulators: ${error.message}`);
			return [];
		}
	}

	/**
	 * Get pipeline statistics
	 * @returns {Object} Pipeline statistics
	 */
	getStatistics() {
		try {
			const manipulators = this.pipeline.getManipulators();
			const types = {};

			manipulators.forEach(m => {
				const type = m.constructor.name;
				types[type] = (types[type] || 0) + 1;
			});

			return {
				totalManipulators: manipulators.length,
				typeBreakdown: types,
				availableTypes: ManipulatorPipeline.MANIPULATOR_REGISTRY.length,
				pipelineRunning: manipulators.length > 0
			};
		} catch (error) {
			this.uiManager.logMessage(`Error getting pipeline statistics: ${error.message}`);
			return { totalManipulators: 0, typeBreakdown: {}, availableTypes: 0, pipelineRunning: false };
		}
	}

	/**
	 * Validate a manipulator configuration
	 * @param {Object} config - Manipulator configuration to validate
	 * @returns {boolean} True if valid, false otherwise
	 */
	validateManipulatorConfig(config) {
		if (!config || typeof config !== 'object') {
			return false;
		}

		if (!config.type || typeof config.type !== 'string') {
			return false;
		}

		// Check if the manipulator type exists
		const ManipulatorClass = ManipulatorPipeline.MANIPULATOR_REGISTRY.find(c => c.name === config.type);
		if (!ManipulatorClass) {
			return false;
		}

		return true;
	}

	/**
	 * Get available manipulator types
	 * @returns {Array} Array of manipulator type information
	 */
	getAvailableTypes() {
		return ManipulatorPipeline.MANIPULATOR_REGISTRY.map(ManipulatorClass => ({
			name: ManipulatorClass.name,
			displayName: ManipulatorClass.displayName,
			description: ManipulatorClass.description || 'No description available'
		}));
	}

	/**
	 * Find manipulators by type
	 * @param {string} type - Manipulator type name
	 * @returns {Array} Array of manipulators of the specified type
	 */
	findManipulatorsByType(type) {
		try {
			return this.pipeline.getManipulators().filter(m => m.constructor.name === type);
		} catch (error) {
			this.uiManager.logMessage(`Error finding manipulators by type: ${error.message}`);
			return [];
		}
	}

	/**
	 * Set callback for pipeline change events
	 * @param {Function} callback - Callback function to call when pipeline changes
	 */
	onPipelineChange(callback) {
		this.pipelineChangeCallback = callback;
	}

	/**
	 * Internal method called when pipeline changes
	 * Triggers the broadcast manager update and any registered callbacks
	 */
	onPipelineChanged() {
		if (this.pipelineChangeCallback) {
			this.pipelineChangeCallback();
		}

		// Emit custom event for other managers to listen to
		if (typeof CustomEvent !== 'undefined') {
			const event = new CustomEvent('pipelineChanged', {
				detail: {
					manipulatorCount: this.pipeline.getManipulators().length,
					timestamp: new Date()
				}
			});
			document.dispatchEvent(event);
		}
	}

	/**
	 * Enable or disable a manipulator
	 * @param {Object} manipulator - Manipulator instance
	 * @param {boolean} enabled - Whether to enable the manipulator
	 */
	setManipulatorEnabled(manipulator, enabled) {
		try {
			if (manipulator.setEnabled) {
				manipulator.setEnabled(enabled);
				this.uiManager.logMessage(`${manipulator.constructor.displayName} ${enabled ? 'enabled' : 'disabled'}`);
			}
		} catch (error) {
			this.uiManager.logMessage(`Error setting manipulator enabled state: ${error.message}`);
		}
	}

	/**
	 * Get the index of a manipulator in the pipeline
	 * @param {Object} manipulator - Manipulator instance
	 * @returns {number} Index of the manipulator, or -1 if not found
	 */
	getManipulatorIndex(manipulator) {
		try {
			return this.pipeline.getManipulators().indexOf(manipulator);
		} catch (error) {
			this.uiManager.logMessage(`Error getting manipulator index: ${error.message}`);
			return -1;
		}
	}

	/**
	 * Check if pipeline has any manipulators
	 * @returns {boolean} True if pipeline has manipulators
	 */
	hasManipulators() {
		try {
			return this.pipeline.getManipulators().length > 0;
		} catch (error) {
			return false;
		}
	}

	/**
	 * Dispose of the pipeline manager and clean up resources
	 */
	dispose() {
		try {
			this.clearPipeline();
			this.pipelineChangeCallback = null;
		} catch (error) {
			console.error('Error during PipelineManager disposal:', error);
		}
	}
}