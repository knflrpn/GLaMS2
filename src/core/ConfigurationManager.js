// ./src/core/ConfigurationManager.js

/**
 * ConfigurationManager handles all configuration save/load/export/import operations
 * Manages presets, saved configurations, and broadcast settings
 */
export class ConfigurationManager {
    constructor(pipeline, uiManager) {
        this.pipeline = pipeline;
        this.uiManager = uiManager;
        this.storageKey = 'swicc-configs';
        
        this.presets = this.initializePresets();
        this.setupEventListeners();
    }

    /**
     * Initialize built-in presets
     * @returns {Object} Preset configurations
     */
    initializePresets() {
        return {
            default: {
                name: 'Default',
                description: 'Passthrough with controller display',
                pipeline: []
            },
            TwitchControl: {
                name: 'Twitch Control',
                description: 'Display and Twitch Chat control',
                pipeline: [
                    { type: 'ChatCommand', config: {} }
                ]
            }
            // Additional presets can be added here
        };
    }

    /**
     * Setup event listeners for configuration controls
     */
    setupEventListeners() {
        // Preset controls
        this.uiManager.addEventListenerSafe('loadPresetBtn', 'click', () => {
            this.loadPreset();
        });

        // Configuration save/load/delete
        this.uiManager.addEventListenerSafe('saveConfigBtn', 'click', () => {
            this.saveConfiguration();
        });

        this.uiManager.addEventListenerSafe('loadConfigBtn', 'click', () => {
            this.loadConfiguration();
        });

        this.uiManager.addEventListenerSafe('deleteConfigBtn', 'click', () => {
            this.deleteConfiguration();
        });

        // Import/Export
        this.uiManager.addEventListenerSafe('exportConfigBtn', 'click', () => {
            this.exportConfiguration();
        });

        this.uiManager.addEventListenerSafe('importConfigBtn', 'click', () => {
            this.triggerImport();
        });

        this.uiManager.addEventListenerSafe('importFileInput', 'change', (e) => {
            this.handleFileImport(e);
        });

        // Configuration selector change
        this.uiManager.addEventListenerSafe('configSelector', 'change', () => {
            this.updateConfigButtons();
        });
    }

    /**
     * Initialize the configuration UI
     */
    initializeUI() {
        this.uiManager.populatePresetSelector(this.presets);
        this.updateConfigSelector();
    }

    /**
     * Load a preset configuration
     */
    loadPreset() {
        const presetKey = this.uiManager.getInputValue('presetSelector');
        
        if (!presetKey) {
            this.uiManager.showStatus('Please select a preset to load', 'error');
            return;
        }

        const preset = this.presets[presetKey];
        if (!preset) {
            this.uiManager.showStatus(`Preset '${presetKey}' not found`, 'error');
            return;
        }

        try {
            // Clear existing pipeline
            this.clearPipeline();

            // Load preset pipeline
            this.loadPipelineConfig(preset.pipeline);

            this.uiManager.showStatus(`Preset "${preset.name}" loaded successfully`, 'success');
            this.uiManager.logMessage(`Loaded preset: ${preset.name} - ${preset.description}`);

        } catch (error) {
            this.uiManager.showStatus(`Error loading preset: ${error.message}`, 'error');
            this.uiManager.logMessage(`Preset load error: ${error.message}`);
        }
    }

    /**
     * Save current configuration
     */
    saveConfiguration() {
        const name = this.uiManager.getInputValue('configName').trim();

        if (!name) {
            this.uiManager.showStatus('Please enter a configuration name', 'error');
            return;
        }

        try {
            const config = {
                name: name,
                timestamp: new Date().toISOString(),
                version: '1.0',
                pipeline: this.getCurrentPipelineConfig(),
                broadcast: this.pipeline.getBroadcastConfig()
            };

            // Save to localStorage
            const savedConfigs = this.getSavedConfigurations();
            savedConfigs[name] = config;
            this.setSavedConfigurations(savedConfigs);

            // Update UI
            this.updateConfigSelector();
            this.uiManager.setInputValue('configName', '');
            
            this.uiManager.showStatus(`Configuration "${name}" saved successfully`, 'success');
            this.uiManager.logMessage(`Configuration saved: ${name}`);

        } catch (error) {
            this.uiManager.showStatus(`Error saving configuration: ${error.message}`, 'error');
            this.uiManager.logMessage(`Save error: ${error.message}`);
        }
    }

    /**
     * Load a saved configuration
     */
    loadConfiguration() {
        const name = this.uiManager.getInputValue('configSelector');

        if (!name) {
            this.uiManager.showStatus('Please select a configuration to load', 'error');
            return;
        }

        try {
            const savedConfigs = this.getSavedConfigurations();
            const config = savedConfigs[name];

            if (!config) {
                this.uiManager.showStatus(`Configuration "${name}" not found`, 'error');
                return;
            }

            // Load pipeline configuration
            this.loadPipelineConfig(config.pipeline);

            // Load broadcast configuration if available
            if (config.broadcast) {
                this.loadBroadcastConfig(config.broadcast);
            }

            this.uiManager.showStatus(`Configuration "${name}" loaded successfully`, 'success');
            this.uiManager.logMessage(`Configuration loaded: ${name}`);

        } catch (error) {
            this.uiManager.showStatus(`Error loading configuration: ${error.message}`, 'error');
            this.uiManager.logMessage(`Load error: ${error.message}`);
        }
    }

    /**
     * Delete a saved configuration
     */
    deleteConfiguration() {
        const name = this.uiManager.getInputValue('configSelector');

        if (!name) {
            this.uiManager.showStatus('Please select a configuration to delete', 'error');
            return;
        }

        if (!confirm(`Are you sure you want to delete configuration "${name}"?`)) {
            return;
        }

        try {
            const savedConfigs = this.getSavedConfigurations();
            
            if (!savedConfigs[name]) {
                this.uiManager.showStatus(`Configuration "${name}" not found`, 'error');
                return;
            }

            delete savedConfigs[name];
            this.setSavedConfigurations(savedConfigs);

            this.updateConfigSelector();
            this.uiManager.showStatus(`Configuration "${name}" deleted successfully`, 'success');
            this.uiManager.logMessage(`Configuration deleted: ${name}`);

        } catch (error) {
            this.uiManager.showStatus(`Error deleting configuration: ${error.message}`, 'error');
            this.uiManager.logMessage(`Delete error: ${error.message}`);
        }
    }

    /**
     * Export current configuration to file
     */
    exportConfiguration() {
        try {
            const config = {
                name: 'Exported Configuration',
                timestamp: new Date().toISOString(),
                version: '1.0',
                pipeline: this.getCurrentPipelineConfig(),
                broadcast: this.pipeline.getBroadcastConfig()
            };

            // Create and download file
            const blob = new Blob([JSON.stringify(config, null, 2)], { 
                type: 'application/json' 
            });
            const url = URL.createObjectURL(blob);

            const a = document.createElement('a');
            a.href = url;
            a.download = `swicc-config-${new Date().toISOString().slice(0, 10)}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            this.uiManager.showStatus('Configuration exported successfully', 'success');
            this.uiManager.logMessage('Configuration exported to file');

        } catch (error) {
            this.uiManager.showStatus(`Export error: ${error.message}`, 'error');
            this.uiManager.logMessage(`Export error: ${error.message}`);
        }
    }

    /**
     * Trigger file import dialog
     */
    triggerImport() {
        const fileInput = document.getElementById('importFileInput');
        if (fileInput) {
            fileInput.click();
        }
    }

    /**
     * Handle file import from input element
     * @param {Event} event - File input change event
     */
    handleFileImport(event) {
        const file = event.target.files[0];
        if (file) {
            this.importConfiguration(file);
        }
    }

    /**
     * Import configuration from file
     * @param {File} file - Configuration file to import
     */
    importConfiguration(file) {
        const reader = new FileReader();

        reader.onload = (e) => {
            try {
                const config = JSON.parse(e.target.result);

                // Validate configuration structure
                if (!this.validateConfiguration(config)) {
                    throw new Error('Invalid configuration format');
                }

                // Load the configuration
                this.loadPipelineConfig(config.pipeline);

                // Load broadcast config if available
                if (config.broadcast) {
                    this.loadBroadcastConfig(config.broadcast);
                }

                this.uiManager.showStatus('Configuration imported successfully', 'success');
                this.uiManager.logMessage('Configuration imported from file');

            } catch (error) {
                this.uiManager.showStatus(`Error importing configuration: ${error.message}`, 'error');
                this.uiManager.logMessage(`Import error: ${error.message}`);
            }
        };

        reader.onerror = () => {
            this.uiManager.showStatus('Error reading file', 'error');
            this.uiManager.logMessage('File read error during import');
        };

        reader.readAsText(file);
    }

    /**
     * Validate configuration structure
     * @param {Object} config - Configuration to validate
     * @returns {boolean} True if valid, false otherwise
     */
    validateConfiguration(config) {
        if (!config || typeof config !== 'object') {
            return false;
        }

        // Check required fields
        if (!config.pipeline || !Array.isArray(config.pipeline)) {
            return false;
        }

        // Validate pipeline items
        for (const item of config.pipeline) {
            if (!item.type || typeof item.type !== 'string') {
                return false;
            }
            if (item.config && typeof item.config !== 'object') {
                return false;
            }
        }

        return true;
    }

    /**
     * Load pipeline configuration
     * @param {Array} pipelineConfig - Pipeline configuration array
     */
    loadPipelineConfig(pipelineConfig) {
        // This method would need to be implemented by the pipeline manager
        // For now, we'll emit an event or call a callback
        if (this.onLoadPipeline) {
            this.onLoadPipeline(pipelineConfig);
        }
    }

    /**
     * Load broadcast configuration
     * @param {Object} broadcastConfig - Broadcast configuration
     */
    loadBroadcastConfig(broadcastConfig) {
        // Update UI controls
        this.uiManager.setInputValue('broadcastEnabled', broadcastConfig.enabled !== false);
        this.uiManager.setInputValue('innerSnapshotPosition', broadcastConfig.innerSnapshotPosition || 0);
        this.uiManager.setInputValue('outerSnapshotPosition', broadcastConfig.outerSnapshotPosition || 50);

        // Apply to pipeline
        if (this.onLoadBroadcast) {
            this.onLoadBroadcast(broadcastConfig);
        }
    }

    /**
     * Get current pipeline configuration
     * @returns {Array} Current pipeline configuration
     */
    getCurrentPipelineConfig() {
        // This would need to be implemented by the pipeline manager
        if (this.onGetPipelineConfig) {
            return this.onGetPipelineConfig();
        }
        return [];
    }

    /**
     * Clear the current pipeline
     */
    clearPipeline() {
        if (this.onClearPipeline) {
            this.onClearPipeline();
        }
    }

    /**
     * Get saved configurations from localStorage
     * @returns {Object} Saved configurations object
     */
    getSavedConfigurations() {
        try {
            const saved = localStorage.getItem(this.storageKey);
            return saved ? JSON.parse(saved) : {};
        } catch (error) {
            this.uiManager.logMessage(`Error reading saved configurations: ${error.message}`);
            return {};
        }
    }

    /**
     * Save configurations to localStorage
     * @param {Object} configurations - Configurations to save
     */
    setSavedConfigurations(configurations) {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(configurations));
        } catch (error) {
            throw new Error(`Failed to save configurations: ${error.message}`);
        }
    }

    /**
     * Update the configuration selector dropdown
     */
    updateConfigSelector() {
        try {
            const savedConfigs = this.getSavedConfigurations();
            const configArray = Object.values(savedConfigs).sort((a, b) => 
                new Date(b.timestamp) - new Date(a.timestamp)
            );

            this.uiManager.updateConfigSelector(configArray);
            this.updateConfigButtons();

        } catch (error) {
            this.uiManager.logMessage(`Error updating config selector: ${error.message}`);
        }
    }

    /**
     * Update configuration button states based on selection
     */
    updateConfigButtons() {
        const hasSelection = !!this.uiManager.getInputValue('configSelector');
        
        const loadBtn = document.getElementById('loadConfigBtn');
        const deleteBtn = document.getElementById('deleteConfigBtn');
        
        if (loadBtn) loadBtn.disabled = !hasSelection;
        if (deleteBtn) deleteBtn.disabled = !hasSelection;
    }

    /**
     * Get list of available preset names
     * @returns {Array<string>} Preset names
     */
    getPresetNames() {
        return Object.keys(this.presets);
    }

    /**
     * Get list of saved configuration names
     * @returns {Array<string>} Saved configuration names
     */
    getSavedConfigurationNames() {
        const savedConfigs = this.getSavedConfigurations();
        return Object.keys(savedConfigs).sort();
    }

    /**
     * Check if a configuration name already exists
     * @param {string} name - Configuration name to check
     * @returns {boolean} True if name exists
     */
    configurationExists(name) {
        const savedConfigs = this.getSavedConfigurations();
        return name in savedConfigs;
    }

    /**
     * Get configuration by name
     * @param {string} name - Configuration name
     * @returns {Object|null} Configuration object or null if not found
     */
    getConfiguration(name) {
        const savedConfigs = this.getSavedConfigurations();
        return savedConfigs[name] || null;
    }

    /**
     * Set callback functions for pipeline operations
     * @param {Object} callbacks - Callback functions
     * @param {Function} callbacks.onLoadPipeline - Load pipeline configuration
     * @param {Function} callbacks.onLoadBroadcast - Load broadcast configuration
     * @param {Function} callbacks.onGetPipelineConfig - Get current pipeline config
     * @param {Function} callbacks.onClearPipeline - Clear pipeline
     */
    setCallbacks(callbacks) {
        this.onLoadPipeline = callbacks.onLoadPipeline;
        this.onLoadBroadcast = callbacks.onLoadBroadcast;
        this.onGetPipelineConfig = callbacks.onGetPipelineConfig;
        this.onClearPipeline = callbacks.onClearPipeline;
    }

    /**
     * Create a new preset (for dynamic preset creation)
     * @param {string} key - Preset key
     * @param {Object} preset - Preset configuration
     */
    addPreset(key, preset) {
        this.presets[key] = preset;
        this.uiManager.populatePresetSelector(this.presets);
    }

    /**
     * Remove a preset
     * @param {string} key - Preset key to remove
     */
    removePreset(key) {
        delete this.presets[key];
        this.uiManager.populatePresetSelector(this.presets);
    }

    /**
     * Get configuration statistics
     * @returns {Object} Configuration statistics
     */
    getStatistics() {
        const savedConfigs = this.getSavedConfigurations();
        return {
            savedConfigCount: Object.keys(savedConfigs).length,
            presetCount: Object.keys(this.presets).length,
            storageUsed: JSON.stringify(savedConfigs).length,
            lastModified: this.getLastModifiedDate(savedConfigs)
        };
    }

    /**
     * Get the last modified date from saved configurations
     * @param {Object} savedConfigs - Saved configurations
     * @returns {Date|null} Last modified date or null
     */
    getLastModifiedDate(savedConfigs) {
        const timestamps = Object.values(savedConfigs)
            .map(config => config.timestamp)
            .filter(timestamp => timestamp);
        
        return timestamps.length > 0 
            ? new Date(Math.max(...timestamps.map(t => new Date(t))))
            : null;
    }

    /**
     * Clear all saved configurations
     * @param {boolean} confirm - Whether confirmation is required
     */
    clearAllConfigurations(confirm = true) {
        if (confirm && !window.confirm('Are you sure you want to delete all saved configurations?')) {
            return false;
        }

        try {
            localStorage.removeItem(this.storageKey);
            this.updateConfigSelector();
            this.uiManager.showStatus('All configurations cleared', 'success');
            this.uiManager.logMessage('All saved configurations cleared');
            return true;
        } catch (error) {
            this.uiManager.showStatus(`Error clearing configurations: ${error.message}`, 'error');
            return false;
        }
    }

    /**
     * Dispose of the configuration manager
     */
    dispose() {
        // Clear any pending operations
        this.onLoadPipeline = null;
        this.onLoadBroadcast = null;
        this.onGetPipelineConfig = null;
        this.onClearPipeline = null;
    }
}