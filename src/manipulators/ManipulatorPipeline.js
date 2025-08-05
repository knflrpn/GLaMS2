/**
 * ./src/manipulators/ManipulatorPipeline.js
 *
 * Manages a chain of manipulators that process ControllerState objects.
 * Includes registry, position-based indexing, action execution, and display broadcasting.
 */

import { BaseManipulator } from './BaseManipulator.js';
import { TurboButton } from './TurboButton.js';
import { Cooldown } from './Cooldown.js';
import { ButtonRemap } from './ButtonRemap.js';
import { InputDelay } from './InputDelay.js';
import { A2D } from './A2D.js';
import { D2A } from './D2A.js';
import { ChatCommand } from './ChatCommand.js';
import { MouseControl } from './MouseControl.js';
import { Shaker } from './Shaker.js';
import { MouseMotion } from './MouseMotion.js';
import { KeyboardControl } from './KeyboardControl.js';

/**
 * @typedef {Object} BroadcastConfig
 * @property {boolean} [enabled=true] - Whether broadcasting is enabled
 * @property {string} [channelName='swicc-controller'] - Name of the broadcast channel
 * @property {number} [innerSnapshotPosition=0] - Pipeline position for inner highlighting (0-based)
 * @property {number} [outerSnapshotPosition=10] - Pipeline position for outer highlighting (0-based)
 */

/**
 * A pipeline that processes ControllerState through a series of manipulators.
 * Also handles broadcasting controller state snapshots to display windows.
 */
export class ManipulatorPipeline {

	// Manipulator registry - add new manipulator types here
	static MANIPULATOR_REGISTRY = [
		TurboButton,
		ButtonRemap,
		InputDelay,
		Cooldown,
		A2D,
		D2A,
		ChatCommand,
		MouseControl,
		Shaker,
		MouseMotion,
		KeyboardControl,
		// Add more manipulator types here as needed
	];

	/**
	 * @param {BroadcastConfig} broadcastConfig - Configuration for display broadcasting
	 */
	constructor(broadcastConfig = {}) {
		/** @private @type {BaseManipulator[]} */
		this.manipulators = [];

		/** @private */
		this.lastFrameTime = performance.now();

		/** @private */
		this._listeners = new Map();

		// Initialize broadcasting configuration
		this.broadcastConfig = {
			enabled: broadcastConfig.enabled !== false,
			channelName: broadcastConfig.channelName || 'swicc-controller',
			innerSnapshotPosition: broadcastConfig.innerSnapshotPosition ?? 0,
			outerSnapshotPosition: broadcastConfig.outerSnapshotPosition ?? 10,
		};

		// Initialize broadcast channel if enabled
		this.broadcastChannel = null;
		this.lastBroadcast = 0;
		this.stateSnapshots = new Map();

		if (this.broadcastConfig.enabled) {
			this._initializeBroadcasting();
		}

		// Register broadcasting actions
		this._registerBroadcastActions();
	}

	/**
	 * Initialize the broadcast channel
	 * @private
	 */
	_initializeBroadcasting() {
		try {
			this.broadcastChannel = new BroadcastChannel(this.broadcastConfig.channelName);
			console.log(`[ManipulatorPipeline] Broadcasting initialized on channel: ${this.broadcastConfig.channelName}`);
		} catch (error) {
			console.error('[ManipulatorPipeline] Failed to initialize broadcast channel:', error);
			this.broadcastConfig.enabled = false;
		}
	}

	/**
	 * Register actions for broadcast control
	 * @private
	 */
	_registerBroadcastActions() {
		// These actions are available on the pipeline itself
		this.broadcastActions = new Map([
			['setBroadcastEnabled', {
				displayName: 'Set Broadcast Enabled',
				description: 'Enable or disable state broadcasting',
				parameters: [{ name: 'enabled', type: 'boolean', required: true }],
				handler: (params) => this.setBroadcastEnabled(params.enabled)
			}],
			['setBroadcastPositions', {
				displayName: 'Set Broadcast Positions',
				description: 'Set pipeline positions for inner and outer snapshots',
				parameters: [
					{ name: 'innerPosition', type: 'number', required: true },
					{ name: 'outerPosition', type: 'number', required: true }
				],
				handler: (params) => this.setBroadcastPositions(params.innerPosition, params.outerPosition)
			}],
			['getBroadcastConfig', {
				displayName: 'Get Broadcast Config',
				description: 'Get current broadcast configuration',
				handler: () => this.getBroadcastConfig()
			}],
		]);
	}

	/**
	 * Enable or disable broadcasting
	 * @param {boolean} enabled
	 */
	setBroadcastEnabled(enabled) {
		const wasEnabled = this.broadcastConfig.enabled;
		this.broadcastConfig.enabled = enabled;

		if (enabled && !wasEnabled) {
			this._initializeBroadcasting();
		} else if (!enabled && wasEnabled && this.broadcastChannel) {
			this.broadcastChannel.close();
			this.broadcastChannel = null;
		}

		console.log(`[ManipulatorPipeline] Broadcasting ${enabled ? 'enabled' : 'disabled'}`);
		return this.broadcastConfig.enabled;
	}

	/**
	 * Set the pipeline positions for snapshots
	 * @param {number} innerPosition
	 * @param {number} outerPosition
	 */
	setBroadcastPositions(innerPosition, outerPosition) {
		this.broadcastConfig.innerSnapshotPosition = Math.max(0, innerPosition);
		this.broadcastConfig.outerSnapshotPosition = Math.max(0, outerPosition);

		console.log(`[ManipulatorPipeline] Broadcast positions set - inner: ${innerPosition}, outer: ${outerPosition}`);
		return {
			innerPosition: this.broadcastConfig.innerSnapshotPosition,
			outerPosition: this.broadcastConfig.outerSnapshotPosition
		};
	}

	/**
	 * Get current broadcast configuration
	 * @returns {BroadcastConfig}
	 */
	getBroadcastConfig() {
		return { ...this.broadcastConfig };
	}

	/**
	 * Execute a broadcast action
	 * @param {string} actionName
	 * @param {Object} params
	 * @returns {any}
	 */
	executeBroadcastAction(actionName, params = {}) {
		const action = this.broadcastActions.get(actionName);
		if (!action) {
			throw new Error(`Unknown broadcast action: ${actionName}`);
		}

		return action.handler(params);
	}

	/**
	 * Get available broadcast actions
	 * @returns {Map}
	 */
	getBroadcastActions() {
		return new Map(this.broadcastActions);
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
			type: manipulator.constructor.name,
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
			type: manipulator.constructor.name,
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
				type: manipulator.constructor.name,
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
				type: manipulator.constructor.name,
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
		return this.manipulators.filter(m => m.constructor.name === type);
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
			if (manipulator.constructor.name === type) {
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
		const type = manipulator.constructor.name;
		let count = 0;

		for (const m of this.manipulators) {
			if (m.constructor.name === type) {
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
			const type = manipulator.constructor.name;
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
				const type = manipulator.constructor.name;
				const count = (typeCounts.get(type) || 0) + 1;
				typeCounts.set(type, count);

				results.push({
					manipulator,
					id: `${type}-${count}`
				});
			} else {
				// Still need to count even if not matching
				const type = manipulator.constructor.name;
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
	 * Serialize a controller state for transmission
	 * @private
	 */
	_serializeState(state) {
		return {
			digital: { ...state.digital },
			analog: { ...state.analog },
			imuSample: { ...state.imuSample},
			timestamp: Date.now()
		};
	}

	/**
	 * Capture state snapshot at specified position
	 * @private
	 */
	_captureSnapshot(state, snapshotType) {
		if (this.broadcastConfig.enabled) {
			this.stateSnapshots.set(snapshotType, {
				state: this._serializeState(state),
				timestamp: Date.now()
			});
		}
	}

	/**
	 * Broadcast collected state snapshots
	 * @private
	 */
	_broadcastSnapshots() {
		if (!this.broadcastConfig.enabled || !this.broadcastChannel) {
			return;
		}

		const now = Date.now();

		try {
			const message = {
				type: 'controller-state',
				timestamp: now,
				snapshots: {
					inner: this.stateSnapshots.get('inner') || null,
					outer: this.stateSnapshots.get('outer') || null
				}
			};

			this.broadcastChannel.postMessage(message);
			this.lastBroadcast = now;

			// Clear snapshots after broadcasting
			this.stateSnapshots.clear();

		} catch (error) {
			console.error('[ManipulatorPipeline] Broadcast error:', error);
		}
	}

	/**
	 * Send a control message to listening windows
	 * @private
	 */
	_sendControlMessage(type, data = {}) {
		if (!this.broadcastConfig.enabled || !this.broadcastChannel) {
			return;
		}

		try {
			this.broadcastChannel.postMessage({
				type: 'control',
				subType: type,
				timestamp: Date.now(),
				data
			});
		} catch (error) {
			console.error('[ManipulatorPipeline] Control message error:', error);
		}
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

		// Process through manipulators
		for (let i = 0; i < this.manipulators.length; i++) {
			// Capture snapshots if needed
			if (this.broadcastConfig.innerSnapshotPosition === i) {
				this._captureSnapshot(currentState, 'inner');
			}
			if (this.broadcastConfig.outerSnapshotPosition === i) {
				this._captureSnapshot(currentState, 'outer');
			}

			const manipulator = this.manipulators[i];

			if (manipulator.enabled) {
				try {
					currentState = manipulator.process(currentState, deltaTime);
				} catch (err) {
					console.error(`[ManipulatorPipeline] Error in ${manipulator.title}:`, err);
					// Continue processing with the current state
				}
			}
		}

		// Capture snapshots if position is beyond pipeline length
		if (this.broadcastConfig.innerSnapshotPosition >= this.manipulators.length) {
			this._captureSnapshot(currentState, 'inner');
		}
		if (this.broadcastConfig.outerSnapshotPosition >= this.manipulators.length) {
			this._captureSnapshot(currentState, 'outer');
		}

		// Broadcast collected snapshots
		this._broadcastSnapshots();

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
			broadcasting: this.broadcastConfig.enabled,
			broadcastConfig: this.getBroadcastConfig(),
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
			const type = manipulator.constructor.name;
			const count = (typeCounts.get(type) || 0) + 1;
			typeCounts.set(type, count);

			snapshot.push({
				id: `${type}-${count}`,
				type: type,
				title: manipulator.title,
				config: manipulator.getConfig()
			});
		}

		return {
			manipulators: snapshot,
			broadcastConfig: this.getBroadcastConfig()
		};
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

	/**
	 * Dispose of the pipeline and clean up resources
	 */
	dispose() {
		// Clean up manipulators
		this.manipulators.forEach(manipulator => {
			manipulator.onDetach();
		});
		this.manipulators = [];

		// Clean up broadcast channel
		if (this.broadcastChannel) {
			this.broadcastChannel.close();
			this.broadcastChannel = null;
		}

		// Clear listeners
		this._listeners.clear();

		// Clear snapshots
		this.stateSnapshots.clear();

		console.log('[ManipulatorPipeline] Disposed');
	}
}