import { describe, expect, test } from "bun:test"
import { registerPlugin } from "../src/tui.js"
import type {
  PluginBindingSpec,
  PluginCommandSpec,
  PluginLayer,
  PluginRegistrationApi,
} from "../src/tui.js"

function createFakeRegistration() {
  const layers: PluginLayer[] = []
  let routeName = "session"

  const registration: PluginRegistrationApi = {
    keymap: {
      registerLayer(layer) {
        layers.push(layer)
        return undefined
      },
    },
    route: {
      get current() {
        return { name: routeName }
      },
    },
  }

  return {
    registration,
    layers,
    commands(): readonly PluginCommandSpec[] {
      return layers.flatMap((layer) => layer.commands ?? [])
    },
    bindings(): readonly PluginBindingSpec[] {
      return layers.flatMap((layer) => layer.bindings ?? [])
    },
    setRoute(name: string) {
      routeName = name
    },
  }
}

describe("registerPlugin — comando y binding", () => {
  test("registra exactamente un comando palette con slashName delete-last", () => {
    const fake = createFakeRegistration()
    registerPlugin(fake.registration, () => {}, undefined)

    const commands = fake.commands()
    expect(commands).toHaveLength(1)
    expect(commands[0]?.name).toBe("delete-last-assistant-message")
    expect(commands[0]?.namespace).toBe("palette")
    expect(commands[0]?.slashName).toBe("delete-last")
    expect(commands[0]?.title).toBe("Delete last assistant message")
    expect(commands[0]?.category).toBe("Plugin")
  })

  test("run invoca el callback inyectado", () => {
    const fake = createFakeRegistration()
    let ran = false
    registerPlugin(fake.registration, () => { ran = true }, undefined)

    fake.commands()[0]?.run()
    expect(ran).toBe(true)
  })

  test("sin options no registra binding", () => {
    const fake = createFakeRegistration()
    registerPlugin(fake.registration, () => {}, undefined)
    expect(fake.bindings()).toHaveLength(0)
  })

  test("options.keybind válido registra un binding al comando", () => {
    const fake = createFakeRegistration()
    registerPlugin(fake.registration, () => {}, { keybind: "ctrl+alt+d" })

    const bindings = fake.bindings()
    expect(bindings).toHaveLength(1)
    expect(bindings[0]?.key).toBe("ctrl+alt+d")
    expect(bindings[0]?.cmd).toBe("delete-last-assistant-message")
  })

  test("options.keybind vacío, con espacios o no-string no registra binding", () => {
    for (const keybind of ["", "   ", 123, null, {}, undefined]) {
      const fake = createFakeRegistration()
      registerPlugin(fake.registration, () => {}, { keybind })
      expect(fake.bindings()).toHaveLength(0)
    }
  })

  test("options null no registra binding", () => {
    const fake = createFakeRegistration()
    registerPlugin(fake.registration, () => {}, null)
    expect(fake.bindings()).toHaveLength(0)
  })

  test("enabled es false fuera de session y true en session", () => {
    const fake = createFakeRegistration()
    registerPlugin(fake.registration, () => {}, undefined)
    const command = fake.commands()[0]

    fake.setRoute("home")
    expect(command?.enabled()).toBe(false)
    fake.setRoute("session")
    expect(command?.enabled()).toBe(true)
  })
})

describe("tui entry — default export", () => {
  test("id no vacío, tui función y sin export server", async () => {
    const mod = await import("../src/tui.js")
    expect(typeof mod.default.id).toBe("string")
    expect(mod.default.id.length).toBeGreaterThan(0)
    expect(typeof mod.default.tui).toBe("function")
    expect(Object.prototype.hasOwnProperty.call(mod.default, "server")).toBe(false)
  })
})
