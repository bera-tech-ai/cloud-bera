// Example plugin — demonstrates the hot-reload plugin system
  // Drop any .js file into the Plugins/ folder and it loads instantly (no restart needed)

  const handle = async (m, { conn, command, args, text, reply, sender, prefix }) => {
      const num = sender.replace(/@.+/, '')
      return reply(
          `🔌 *Plugin System Working!*\n\nHi +${num}! This response came from the plugin system.\n\n• Plugins live in the Plugins/ folder\n• They hot-reload on file save — no bot restart needed\n• Add your own: create a .js file with name, command, and handler`
      )
  }

  handle.command = ['helloplugin', 'testplugin', 'plugindemo']
  handle.tags    = ['example']
  handle.help    = ['helloplugin — test the plugin system']

  module.exports = handle
  