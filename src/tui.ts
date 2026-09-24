// Entry del plugin TUI: registra el comando en la paleta y el binding
// opcional. Toda la lógica vive en `flow.ts`/`pure.ts`; acá solo hay
// registro y adaptadores finos api → FlowPorts (sin casts, sin JSX).

import type { TuiPlugin, TuiPluginApi } from "@opencode-ai/plugin/tui"
import { runDeleteFlow } from "./flow.js"
import type { FlowPorts } from "./ports.js"

const PLUGIN_ID = "opencode-delete-messages"
const COMMAND_NAME = "delete-last-assistant-message"

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== ""
}

function adapt(api: TuiPluginApi): FlowPorts {
  return {
    listStateMessages(sessionID) {
      return api.state.session.messages(sessionID)
    },

    async fetchServerMessages(sessionID, limit) {
      const result = await api.client.session.messages({ sessionID, limit })
      if (result.error !== undefined) throw result.error
      return result.data ?? []
    },

    readParts(messageID) {
      return api.state.part(messageID)
    },

    readStateStatus(sessionID) {
      return api.state.session.status(sessionID)
    },

    async fetchServerStatus() {
      const result = await api.client.session.status({ directory: api.state.path.directory })
      if (result.error !== undefined) throw result.error
      return result.data ?? {}
    },

    async deleteMessage(args) {
      try {
        const result = await api.client.session.deleteMessage(args)
        if (result.error !== undefined) {
          return { ok: false, error: result.error, status: result.response?.status }
        }
        return { ok: true }
      } catch (error: unknown) {
        return { ok: false, error }
      }
    },

    confirmDelete(title, message, onConfirm, onCancel) {
      api.ui.dialog.setSize("medium")
      api.ui.dialog.replace(() => api.ui.DialogConfirm({ title, message, onConfirm, onCancel }))
    },

    toast(variant, message) {
      api.ui.toast({ variant, message })
    },

    currentRouteName() {
      return api.route.current.name
    },

    currentSessionID() {
      const current = api.route.current
      if (current.name !== "session") return undefined
      const sessionID = (current.params as { sessionID?: unknown } | undefined)?.sessionID
      return typeof sessionID === "string" ? sessionID : undefined
    },

    readDirectory() {
      return api.state.path.directory
    },

    now() {
      return Date.now()
    },
  }
}

/** Comando tal como lo registra el plugin (subconjunto estructural del `Command` real). */
export type PluginCommandSpec = {
  name: string
  title: string
  category: string
  namespace: string
  slashName: string
  desc: string
  enabled: () => boolean
  run: () => void
}

/** Binding tal como lo registra el plugin (subconjunto estructural del `Binding` real). */
export type PluginBindingSpec = {
  key: string
  cmd: string
  desc: string
}

export type PluginLayer = {
  commands?: readonly PluginCommandSpec[]
  bindings?: readonly PluginBindingSpec[]
}

/** Superficie mínima del `api` que necesita el registro (permite tests sin casts). */
export type PluginRegistrationApi = {
  keymap: { registerLayer(layer: PluginLayer): unknown }
  route: { current: { name: string } }
}

/** Registra el comando de paleta y el binding opcional. Separado del entry para testearlo puro. */
export function registerPlugin(
  registration: PluginRegistrationApi,
  run: () => void,
  options: { keybind?: unknown } | undefined,
): void {
  const keybind = options?.keybind

  registration.keymap.registerLayer({
    commands: [
      {
        name: COMMAND_NAME,
        title: "Delete last assistant message",
        category: "Plugin",
        namespace: "palette",
        slashName: "delete-last",
        desc: "Permanently remove the last assistant reply (files are NOT reverted)",
        enabled: () => registration.route.current.name === "session",
        run,
      },
    ],
  })

  if (isNonEmptyString(keybind)) {
    registration.keymap.registerLayer({
      bindings: [{ key: keybind, cmd: COMMAND_NAME, desc: "Delete last assistant message" }],
    })
  }
}

const tui: TuiPlugin = async (api, options) => {
  registerPlugin(api, () => runDeleteFlow(adapt(api)), options)
}

export default { id: PLUGIN_ID, tui }
