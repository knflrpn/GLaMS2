/**
 * ./src/manipulators/ManipulatorPipeline.js
 *
 * Manages a chain of manipulators that process ControllerState objects.
 * Includes registry, position-based indexing, and action execution.
 */

import { BaseManipulator } from './BaseManipulator.js';
import { TurboButton } from './TurboButton.js';
import { DisplayBroadcaster } from './DisplayBroadcaster.js';
import { ButtonRemap } from './ButtonRemap.js';
import { InputDelay } from './InputDelay.js';
import { A2D } from './A2D.js';
import { ChatCommand } from './ChatCommand.js';

/**
 * A pipeline that processes ControllerState through a series of manipulators.
 */
export class ManipulatorPipeline {

	// Manipulator registry - add new manipulator types here
	static MANIPULATOR_REGISTRY = [
		DisplayBroadcaster,
		TurboButton,
		ButtonRemap,
		InputDelay,
		A2D,
		ChatCommand,
		// Add more manipulator types here as needed
	];

	constructor() {
		/** @private @type {BaseManipulator[]} */
		this.manipulators = [];

		/** @private */
		this.lastFrameTime = performance.now();

		/** @private */
		this._listeners = new Map();
	}

	/**
	 * Add a manipulator to the end of the pipeline.
	 * @param {BaseManipulator} manipulator
	 * @returns {ManipulatorPipeline} for chaining
	 */
	add(manipulator) {
		if (!(manipulator instanceof BaseManipulator)) {
			throw new Error('Manipulator must extend BaseManipulator');
		}

		this.manipulators.push(manipulator);
		manipulator.onAttach();

		// Rename all of the enumerators with new numbers
		this._reenumerateAll();

		// Emit registration event
		this._emit('registered', {
			manipulator,
			type: manipulator.constructor.type,
			index: this.manipulators.length - 1
		});

		return this;
	}

	/**
	 * Insert a manipulator at a specific index.
	 * @param {number} index
	 * @param {BaseManipulator} manipulator
	 * @returns {ManipulatorPipeline} for chaining
	 */
	insert(index, manipulator) {
		if (!(manipulator instanceof BaseManipulator)) {
			throw new Error('Manipulator must extend BaseManipulator');
		}

		this.manipulators.splice(index, 0, manipulator);
		manipulator.onAttach();

		// Rename all of the enumerators with new numbers
		this._reenumerateAll();

		// Emit registration event
		this._emit('registered', {
			manipulator,
			type: manipulator.constructor.type,
			index: index
		});

		return this;
	}

	/**
	 * Remove a manipulator from the pipeline.
	 * @param {BaseManipulator} manipulator
	 * @returns {ManipulatorPipeline} for chaining
	 */
	remove(manipulator) {
		const index = this.manipulators.indexOf(manipulator);
		if (index !== -1) {
			this.manipulators.splice(index, 1);
			manipulator.onDetach();

			// Rename all of the enumerators with new numbers
			this._reenumerateAll();

			// Emit unregistration event
			this._emit('unregistered', {
				manipulator,
				type: manipulator.constructor.type,
				previousIndex: index
			});
		}
		return this;
	}

	/**
	 * Remove manipulator at specific index.
	 * @param {number} index
	 * @returns {ManipulatorPipeline} for chaining
	 */
	removeAt(index) {
		if (index >= 0 && index < this.manipulators.length) {
			const manipulator = this.manipulators[index];
			this.manipulators.splice(index, 1);
			manipulator.onDetach();

			// Rename all of the enumerators with new numbers
			this._reenumerateAll();

			// Emit unregistration event
			this._emit('unregistered', {
				manipulator,
				type: manipulator.constructor.type,
				previousIndex: index
			});
		}
		return this;
	}

	/**
	 * Move a manipulator to a new position
	 * @param {BaseManipulator} manipulator
	 * @param {number} newIndex
	 * @returns {ManipulatorPipeline} for chaining
	 */
	move(manipulator, newIndex) {
		const currentIndex = this.manipulators.indexOf(manipulator);
		if (currentIndex === -1) {
			throw new Error('Manipulator not found in pipeline');
		}

		// Remove from current position
		this.manipulators.splice(currentIndex, 1);

		// Insert at new position
		this.manipulators.splice(newIndex, 0, manipulator);

		// Rename all of the enumerators with new numbers
		this._reenumerateAll();

		// Emit move event
		this._emit('moved', {
			manipulator,
			fromIndex: currentIndex,
			toIndex: newIndex
		});

		return this;
	}

	/**
	 * Clear all manipulators from the pipeline.
	 * @returns {ManipulatorPipeline} for chaining
	 */
	clear() {
		const manipulators = [...this.manipulators];
		manipulators.forEach(m => this.remove(m));
		return this;
	}

	/**
	 * Get all manipulators in the pipeline.
	 * @returns {BaseManipulator[]}
	 */
	getManipulators() {
		return [...this.manipulators];
	}

	/**
	 * Get all manipulators of a specific type
	 * @param {string} type
	 * @returns {BaseManipulator[]}
	 */
	getByType(type) {
		return this.manipulators.filter(m => m.constructor.type === type);
	}

	/**
	 * Get a manipulator by position-based ID (e.g., "turbo-1")
	 * @param {string} id - Format: "type-index" where index is 1-based
	 * @returns {BaseManipulator|undefined}
	 */
	get(id) {
		const match = id.match(/^(.+)-(\d+)$/);
		if (!match) {
			throw new Error(`Invalid manipulator ID format: ${id}`);
		}

		const [, type, indexStr] = match;
		const index = parseInt(indexStr, 10);

		if (index < 1) {
			throw new Error(`Invalid index: ${index}. Indices start at 1`);
		}

		// Find the Nth manipulator of this type
		let count = 0;
		for (const manipulator of this.manipulators) {
			if (manipulator.constructor.type === type) {
				count++;
				if (count === index) {
					return manipulator;
				}
			}
		}

		return undefined;
	}

	/**
	 * Get the position-based ID for a manipulator
	 * @param {BaseManipulator} manipulator
	 * @returns {string|null} ID like "turbo-1" or null if not found
	 */
	getId(manipulator) {
		const type = manipulator.constructor.type;
		let count = 0;

		for (const m of this.manipulators) {
			if (m.constructor.type === type) {
				count++;
				if (m === manipulator) {
					return `${type}-${count}`;
				}
			}
		}

		return null;
	}

	/**
	 * Get manipulator info for external systems
	 * @returns {Object[]}
	 */
	getManipulatorInfo() {
		const info = [];
		const typeCounts = new Map();

		for (const manipulator of this.manipulators) {
			const type = manipulator.constructor.type;
			const count = (typeCounts.get(type) || 0) + 1;
			typeCounts.set(type, count);

			info.push({
				id: `${type}-${count}`,
				title: manipulator.title,
				type: type,
				enabled: manipulator.enabled,
				actions: this._getActionInfo(manipulator)
			});
		}

		return info;
	}

	/**
	 * Get action info for a manipulator
	 * @private
	 */
	_getActionInfo(manipulator) {
		const actions = manipulator.getActions();
		const actionInfo = {};

		actions.forEach((action, name) => {
			actionInfo[name] = {
				displayName: action.displayName,
				description: action.description,
				parameters: action.parameters || []
			};
		});

		return actionInfo;
	}

	/**
	 * Execute an action on a manipulator by ID
	 * @param {string} manipulatorId - Format: "type-index"
	 * @param {string} actionName
	 * @param {Object} params
	 * @returns {any} Action result
	 */
	executeAction(manipulatorId, actionName, params = {}) {
		const manipulator = this.get(manipulatorId);
		if (!manipulator) {
			throw new Error(`Manipulator not found: ${manipulatorId}`);
		}

		// Execute the action
		const result = manipulator.executeAction(actionName, params);

		// Emit action event
		this._emit('actionExecuted', {
			manipulatorId,
			manipulator,
			actionName,
			params,
			result
		});

		return result;
	}

	/**
	 * Execute an action on all manipulators of a type
	 * @param {string} type
	 * @param {string} actionName
	 * @param {Object} params
	 * @returns {Map<string, any>} Map of manipulator ID to result
	 */
	executeActionOnType(type, actionName, params = {}) {
		const results = new Map();
		const manipulators = this.getByType(type);

		manipulators.forEach((manipulator, index) => {
			const id = `${type}-${index + 1}`;
			try {
				const result = manipulator.executeAction(actionName, params);
				results.set(id, { success: true, result });
			} catch (error) {
				results.set(id, { success: false, error: error.message });
			}
		});

		return results;
	}

	/**
	 * Execute an action on all manipulators
	 * @param {string} actionName
	 * @param {Object} params
	 * @returns {Map<string, any>} Map of manipulator ID to result
	 */
	executeActionOnAll(actionName, params = {}) {
		const results = new Map();
		const info = this.getManipulatorInfo();

		info.forEach(({ id }, index) => {
			try {
				const result = this.manipulators[index].executeAction(actionName, params);
				results.set(id, { success: true, result });
			} catch (error) {
				results.set(id, { success: false, error: error.message });
			}
		});

		return results;
	}

	/**
	 * Find manipulators matching criteria
	 * @param {Function} predicate
	 * @returns {Array<{manipulator: BaseManipulator, id: string}>}
	 */
	find(predicate) {
		const results = [];
		const typeCounts = new Map();

		for (const manipulator of this.manipulators) {
			if (predicate(manipulator)) {
				const type = manipulator.constructor.type;
				const count = (typeCounts.get(type) || 0) + 1;
				typeCounts.set(type, count);

				results.push({
					manipulator,
					id: `${type}-${count}`
				});
			} else {
				// Still need to count even if not matching
				const type = manipulator.constructor.type;
				const count = (typeCounts.get(type) || 0) + 1;
				typeCounts.set(type, count);
			}
		}

		return results;
	}

	/**
	 * Get count by type
	 * @param {string} type
	 * @returns {number}
	 */
	getCountByType(type) {
		return this.getByType(type).length;
	}

	/**
	 * Get pipeline size
	 * @returns {number}
	 */
	get size() {
		return this.manipulators.length;
	}

	/**
	 * Process a ControllerState through the pipeline.
	 * @param {import('../core/ControllerState.js').ControllerState} state
	 * @returns {import('../core/ControllerState.js').ControllerState}
	 */
	process(state) {
		const now = performance.now();
		const deltaTime = now - this.lastFrameTime;
		this.lastFrameTime = now;

		let currentState = state;

		for (const manipulator of this.manipulators) {
			if (manipulator.enabled) {
				try {
					currentState = manipulator.process(currentState, deltaTime);
				} catch (err) {
					console.error(`[ManipulatorPipeline] Error in ${manipulator.title}:`, err);
					// Continue processing with the current state
				}
			}
		}

		return currentState;
	}

	/**
	 * Get pipeline status for debugging.
	 * @returns {Object}
	 */
	getStatus() {
		return {
			count: this.manipulators.length,
			enabled: this.manipulators.filter(m => m.enabled).length,
			manipulators: this.manipulators.map(m => ({
				title: m.title,
				enabled: m.enabled,
				type: m.constructor.name
			}))
		};
	}

	/**
	 * Create a snapshot of current state for saving
	 * @returns {Object}
	 */
	createSnapshot() {
		const snapshot = [];
		const typeCounts = new Map();

		for (const manipulator of this.manipulators) {
			const type = manipulator.constructor.type;
			const count = (typeCounts.get(type) || 0) + 1;
			typeCounts.set(type, count);

			snapshot.push({
				id: `${type}-${count}`,
				type: type,
				title: manipulator.title,
				config: manipulator.getConfig()
			});
		}

		return { manipulators: snapshot };
	}

	/**
	 * Add event listener
	 * @param {string} event - 'registered', 'unregistered', 'moved', 'actionExecuted'
	 * @param {Function} handler
	 */
	on(event, handler) {
		if (!this._listeners.has(event)) {
			this._listeners.set(event, new Set());
		}
		this._listeners.get(event).add(handler);
	}

	/**
	 * Remove event listener
	 * @param {string} event
	 * @param {Function} handler
	 */
	off(event, handler) {
		const handlers = this._listeners.get(event);
		if (handlers) {
			handlers.delete(handler);
		}
	}

	/**
	 * Re-enumerate all manipulators with proper numbering based on their type
	 * @private
	 */
	_reenumerateAll() {
		const typeCounts = new Map();

		for (const manipulator of this.manipulators) {
			const type = manipulator.constructor.name;
			const count = (typeCounts.get(type) || 0) + 1;
			typeCounts.set(type, count);

			// Set the numbered title
			manipulator.setTitle(`${manipulator.constructor.displayName} ${count}`);
		}
	}

	/**
	 * Emit event
	 * @private
	 */
	_emit(event, data) {
		const handlers = this._listeners.get(event);
		if (handlers) {
			handlers.forEach(handler => handler(data));
		}
	}
}