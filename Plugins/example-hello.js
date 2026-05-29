// Example plugin — demonstrates the hot-reload plugin system
// Drop any .js file into the Plugins/ folder and it loads instantly (no restart needed)

module.exports = {
    name: 'hello-plugin',
    description: 'Responds to "hello plugin" with a demo message',
    triggers: ['hello plugin', 'test plugin', 'plugin demo'],

    handler: async ({ text, reply, sender }) => {
        const num = sender.replace(/@.+/, '')
        return {
            success: true,
            output: `🔌 *Plugin System Working!*\n\nHi +${num}! This response came from the plugin system.\n\n• Plugins live in the Plugins/ folder\n• They hot-reload on file save — no bot restart needed\n• Add your own: create a .js file with name, triggers, and handler`
        }
    }
}
