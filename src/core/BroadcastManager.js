// ./src/core/BroadcastManager.js

/**
 * BroadcastManager handles controller display broadcast functionality
 * Manages snapshot positions, display window, and broadcast settings
 */
export class BroadcastManager {
    constructor(pipeline, uiManager) {
        this.pipeline = pipeline;
        this.uiManager = uiManager;
        this.displayWindow = null;
        
        this.setupEventListeners();
        this.initializeBroadcastControls();
    }

    /**
     * Setup event listeners for broadcast controls
     */
    setupEventListeners() {
        // Broadcast settings controls
        this.uiManager.addEventListenerSafe('applyBroadcastSettings', 'click', () => {
            this.applyBroadcastSettings();
        });

        this.uiManager.addEventListenerSafe('openDisplayWindow', 'click', () => {
            this.openDisplayWindow();
        });

        // Auto-apply when broadcast enabled checkbox changes
        this.uiManager.addEventListenerSafe('broadcastEnabled', 'click', () => {
            this.applyBroadcastSettings();
        });

        // Position change handlers with validation
        this.uiManager.addEventListenerSafe('innerSnapshotPosition', 'change', () => {
            this.handleInnerPositionChange();
        });

        this.uiManager.addEventListenerSafe('outerSnapshotPosition', 'change', () => {
            this.handleOuterPositionChange();
        });

        // Listen for pipeline changes to update indicators
        document.addEventListener('pipelineChanged', () => {
            this.updateSnapshotIndicators();
        });
    }

    /**
     * Initialize broadcast controls with current pipeline settings
     */
    initializeBroadcastControls() {
        try {
            // Load current broadcast config from pipeline
            const config = this.pipeline.getBroadcastConfig();
            
            // Set initial values in UI
            this.updateUIFromConfig(config);
            
            // Update snapshot indicators
            this.updateSnapshotIndicators();
            
            this.uiManager.logMessage('Broadcast controls initialized');

        } catch (error) {
            this.uiManager.logMessage(`Error initializing broadcast controls: ${error.message}`);
            // Set defaults if pipeline config fails
            this.setDefaultBroadcastConfig();
        }
    }

    /**
     * Update UI controls from broadcast configuration
     * @param {Object} config - Broadcast configuration
     */
    updateUIFromConfig(config) {
        const broadcastEnabled = document.getElementById('broadcastEnabled');
        const innerSnapshotPosition = document.getElementById('innerSnapshotPosition');
        const outerSnapshotPosition = document.getElementById('outerSnapshotPosition');

        if (broadcastEnabled) {
            broadcastEnabled.checked = config.enabled !== false;
        }

        if (innerSnapshotPosition) {
            innerSnapshotPosition.value = config.innerSnapshotPosition || 0;
        }

        if (outerSnapshotPosition) {
            outerSnapshotPosition.value = config.outerSnapshotPosition || 10;
        }
    }

    /**
     * Set default broadcast configuration if pipeline config fails
     */
    setDefaultBroadcastConfig() {
        const defaultConfig = {
            enabled: false,
            innerSnapshotPosition: 0,
            outerSnapshotPosition: 10
        };

        this.updateUIFromConfig(defaultConfig);
        this.uiManager.logMessage('Using default broadcast configuration');
    }

    /**
     * Handle inner snapshot position changes with validation
     */
    handleInnerPositionChange() {
        const innerPos = parseInt(this.uiManager.getInputValue('innerSnapshotPosition')) || 0;
        const outerPos = parseInt(this.uiManager.getInputValue('outerSnapshotPosition')) || 10;

        this.updateSnapshotIndicators();
    }

    /**
     * Handle outer snapshot position changes with validation
     */
    handleOuterPositionChange() {
        const innerPos = parseInt(this.uiManager.getInputValue('innerSnapshotPosition')) || 0;
        const outerPos = parseInt(this.uiManager.getInputValue('outerSnapshotPosition')) || 10;

        this.updateSnapshotIndicators();
    }

    /**
     * Apply broadcast settings to the pipeline
     */
    applyBroadcastSettings() {
        try {
            const enabled = document.getElementById('broadcastEnabled')?.checked || false;
            const innerPos = parseInt(this.uiManager.getInputValue('innerSnapshotPosition')) || 0;
            const outerPos = parseInt(this.uiManager.getInputValue('outerSnapshotPosition')) || 10;

            // Update pipeline settings
            this.pipeline.setBroadcastEnabled(enabled);
            this.pipeline.setBroadcastPositions(innerPos, outerPos);

            // Update visual indicators
            this.updateSnapshotIndicators();

            // Send update to display window if open
            this.notifyDisplayWindow();

            const statusMessage = `Broadcast settings applied: ${enabled ? 'enabled' : 'disabled'}, positions: ${innerPos}, ${outerPos}`;
            this.uiManager.logMessage(statusMessage);
            this.uiManager.showStatus('Broadcast settings applied successfully', 'success');

        } catch (error) {
            this.uiManager.logMessage(`Error applying broadcast settings: ${error.message}`);
            this.uiManager.showStatus(`Error: ${error.message}`, 'error');
        }
    }

    /**
     * Update visual snapshot indicators in the pipeline
     */
    updateSnapshotIndicators() {
        try {
            // Remove existing indicators
            this.uiManager.removeSnapshotIndicators();

            const config = this.pipeline.getBroadcastConfig();
            const manipulators = this.pipeline.getManipulators();

            if (!config.enabled) {
                return; // Don't show indicators if broadcasting is disabled
            }

            // Create indicators for positions
            const positions = [
                { 
                    type: 'inner', 
                    position: config.innerSnapshotPosition, 
                    label: 'Inner Highlight Capture for Controller Display' 
                },
                { 
                    type: 'outer', 
                    position: config.outerSnapshotPosition, 
                    label: 'Outer Highlight Capture for Controller Display' 
                }
            ];

            positions.forEach(({ type, position, label }) => {
                const indicator = this.uiManager.createSnapshotIndicator(type, label);
                this.insertSnapshotIndicator(indicator, position, manipulators.length);
            });

        } catch (error) {
            this.uiManager.logMessage(`Error updating snapshot indicators: ${error.message}`);
        }
    }

    /**
     * Insert snapshot indicator at the correct position
     * @param {HTMLElement} indicator - Indicator element to insert
     * @param {number} position - Position in pipeline
     * @param {number} totalManipulators - Total number of manipulators
     */
    insertSnapshotIndicator(indicator, position, totalManipulators) {
        const container = this.uiManager.elements.pipelineContainer;

        if (position === 0) {
            // Insert at the beginning
            container.insertBefore(indicator, container.firstChild);
        } else if (position >= totalManipulators) {
            // Insert at the end
            container.appendChild(indicator);
        } else {
            // Insert before the manipulator at this position
            const manipulatorElements = container.querySelectorAll('.manipulator-wrapper');
            if (manipulatorElements[position]) {
                container.insertBefore(indicator, manipulatorElements[position]);
            } else {
                // Fallback to end if position not found
                container.appendChild(indicator);
            }
        }
    }

    /**
     * Open controller display window
     */
    openDisplayWindow() {
        try {
            const url = './controller-display.html';
            const windowFeatures = 'width=1000,height=700,resizable=yes,scrollbars=yes';

            this.displayWindow = window.open(url, 'swicc-display', windowFeatures);

            if (this.displayWindow) {
                // Setup window close event listener
                this.setupDisplayWindowEvents();
                
                this.uiManager.logMessage('Display window opened');
                this.uiManager.showStatus('Display window opened', 'success');
                
                // Send initial configuration to the display window
                setTimeout(() => {
                    this.notifyDisplayWindow();
                }, 1000); // Wait for window to load
                
            } else {
                throw new Error('Failed to open window - popup blocked?');
            }

        } catch (error) {
            this.uiManager.logMessage(`Error opening display window: ${error.message}`);
            this.uiManager.showStatus(`Error opening window: ${error.message}`, 'error');
        }
    }

    /**
     * Setup event listeners for the display window
     */
    setupDisplayWindowEvents() {
        if (!this.displayWindow) return;

        // Check if window is closed periodically
        const checkClosed = () => {
            if (this.displayWindow.closed) {
                this.displayWindow = null;
                this.uiManager.logMessage('Display window closed');
                return;
            }
            setTimeout(checkClosed, 1000);
        };
        
        setTimeout(checkClosed, 1000);
    }

    /**
     * Send configuration update to display window
     */
    notifyDisplayWindow() {
        if (!this.displayWindow || this.displayWindow.closed) {
            return;
        }

        try {
            const config = this.pipeline.getBroadcastConfig();
            const message = {
                type: 'broadcast-config-update',
                config: config,
                timestamp: Date.now()
            };

            this.displayWindow.postMessage(message, '*');

        } catch (error) {
            this.uiManager.logMessage(`Error notifying display window: ${error.message}`);
        }
    }

    /**
     * Get current broadcast configuration
     * @returns {Object} Current broadcast configuration
     */
    getBroadcastConfig() {
        try {
            return this.pipeline.getBroadcastConfig();
        } catch (error) {
            this.uiManager.logMessage(`Error getting broadcast config: ${error.message}`);
            return { enabled: false, innerSnapshotPosition: 0, outerSnapshotPosition: 10 };
        }
    }

    /**
     * Load broadcast configuration from saved data
     * @param {Object} config - Broadcast configuration to load
     */
    loadConfig(config) {
        try {
            // Validate configuration
            if (!this.validateBroadcastConfig(config)) {
                throw new Error('Invalid broadcast configuration');
            }

            // Update UI controls
            this.updateUIFromConfig(config);

            // Apply to pipeline
            this.applyBroadcastSettings();

            this.uiManager.logMessage('Broadcast configuration loaded');

        } catch (error) {
            this.uiManager.logMessage(`Error loading broadcast config: ${error.message}`);
            this.uiManager.showStatus(`Error loading broadcast config: ${error.message}`, 'error');
        }
    }

    /**
     * Validate broadcast configuration structure
     * @param {Object} config - Configuration to validate
     * @returns {boolean} True if valid, false otherwise
     */
    validateBroadcastConfig(config) {
        if (!config || typeof config !== 'object') {
            return false;
        }

        // Check for required properties with proper types
        if (typeof config.enabled !== 'boolean' && config.enabled !== undefined) {
            return false;
        }

        if (config.innerSnapshotPosition !== undefined && 
            (typeof config.innerSnapshotPosition !== 'number' || config.innerSnapshotPosition < 0)) {
            return false;
        }

        if (config.outerSnapshotPosition !== undefined && 
            (typeof config.outerSnapshotPosition !== 'number' || config.outerSnapshotPosition < 0)) {
            return false;
        }

        // Validate position relationship
        if (config.innerSnapshotPosition !== undefined && 
            config.outerSnapshotPosition !== undefined &&
            config.innerSnapshotPosition > config.outerSnapshotPosition) {
            return false;
        }

        return true;
    }

    /**
     * Reset broadcast settings to defaults
     */
    resetToDefaults() {
        try {
            const defaultConfig = {
                enabled: false,
                innerSnapshotPosition: 0,
                outerSnapshotPosition: 10
            };

            this.updateUIFromConfig(defaultConfig);
            this.applyBroadcastSettings();

            this.uiManager.showStatus('Broadcast settings reset to defaults', 'success');
            this.uiManager.logMessage('Broadcast settings reset to defaults');

        } catch (error) {
            this.uiManager.logMessage(`Error resetting broadcast settings: ${error.message}`);
            this.uiManager.showStatus(`Error resetting settings: ${error.message}`, 'error');
        }
    }

    /**
     * Get broadcast statistics for monitoring
     * @returns {Object} Broadcast statistics
     */
    getStatistics() {
        try {
            const config = this.getBroadcastConfig();
            return {
                enabled: config.enabled,
                innerPosition: config.innerSnapshotPosition,
                outerPosition: config.outerSnapshotPosition,
                displayWindowOpen: !!(this.displayWindow && !this.displayWindow.closed),
                indicatorsVisible: config.enabled,
                positionRange: config.outerSnapshotPosition - config.innerSnapshotPosition
            };
        } catch (error) {
            return {
                enabled: false,
                innerPosition: 0,
                outerPosition: 10,
                displayWindowOpen: false,
                indicatorsVisible: false,
                positionRange: 0
            };
        }
    }

    /**
     * Close display window if open
     */
    closeDisplayWindow() {
        if (this.displayWindow && !this.displayWindow.closed) {
            try {
                this.displayWindow.close();
                this.displayWindow = null;
                this.uiManager.logMessage('Display window closed');
                this.uiManager.showStatus('Display window closed', 'success');
            } catch (error) {
                this.uiManager.logMessage(`Error closing display window: ${error.message}`);
            }
        }
    }

    /**
     * Check if display window is currently open
     * @returns {boolean} True if display window is open
     */
    isDisplayWindowOpen() {
        return !!(this.displayWindow && !this.displayWindow.closed);
    }

    /**
     * Update position constraints based on current pipeline size
     */
    updatePositionConstraints() {
        try {
            const manipulators = this.pipeline.getManipulators();
            const maxPosition = 10;

            const innerInput = document.getElementById('innerSnapshotPosition');
            const outerInput = document.getElementById('outerSnapshotPosition');

            if (innerInput) {
                innerInput.max = maxPosition;
                // Adjust value if it exceeds new max
                if (parseInt(innerInput.value) > maxPosition) {
                    innerInput.value = maxPosition;
                }
            }

            if (outerInput) {
                outerInput.max = maxPosition;
                // Adjust value if it exceeds new max
                if (parseInt(outerInput.value) > maxPosition) {
                    outerInput.value = maxPosition;
                }
            }

        } catch (error) {
            this.uiManager.logMessage(`Error updating position constraints: ${error.message}`);
        }
    }

    /**
     * Enable or disable broadcast functionality
     * @param {boolean} enabled - Whether to enable broadcasting
     */
    setBroadcastEnabled(enabled) {
        try {
            const checkbox = document.getElementById('broadcastEnabled');
            if (checkbox) {
                checkbox.checked = enabled;
                this.applyBroadcastSettings();
            }
        } catch (error) {
            this.uiManager.logMessage(`Error setting broadcast enabled: ${error.message}`);
        }
    }

    /**
     * Set snapshot positions programmatically
     * @param {number} innerPosition - Inner snapshot position
     * @param {number} outerPosition - Outer snapshot position
     */
    setSnapshotPositions(innerPosition, outerPosition) {
        try {
            // Validate positions
            if (innerPosition < 0 || outerPosition < 0 || innerPosition > outerPosition) {
                throw new Error('Invalid snapshot positions');
            }

            this.uiManager.setInputValue('innerSnapshotPosition', innerPosition);
            this.uiManager.setInputValue('outerSnapshotPosition', outerPosition);
            
            this.applyBroadcastSettings();

        } catch (error) {
            this.uiManager.logMessage(`Error setting snapshot positions: ${error.message}`);
            this.uiManager.showStatus(`Error setting positions: ${error.message}`, 'error');
        }
    }

    /**
     * Dispose of the broadcast manager and clean up resources
     */
    dispose() {
        try {
            // Close display window
            this.closeDisplayWindow();
            
            // Remove snapshot indicators
            this.uiManager.removeSnapshotIndicators();
            
            this.uiManager.logMessage('BroadcastManager disposed');

        } catch (error) {
            console.error('Error during BroadcastManager disposal:', error);
        }
    }
}