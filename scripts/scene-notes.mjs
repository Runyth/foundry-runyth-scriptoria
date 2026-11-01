import { FLAG_SCOPE, MODULE_ID } from "./constants.mjs";
import { localize } from "./i18n.mjs";
import { openDocumentView } from "./document-views.mjs";
import { notifyReaderError } from "./reader.mjs";

const interactionBindings = new Map();
let hooksRegistered = false;

/**
 * Register Runyth Scriptoria's scene-note integration once.
 *
 * The integration deliberately leaves Foundry's native Note interaction
 * manager intact. It only activates the Notes layer and controls a Runyth Scriptoria
 * Note after a permitted single click, allowing core drag, keyboard movement,
 * configuration, double-click reading, and deletion workflows to proceed.
 */
export function registerSceneNoteHooks() {
  if (hooksRegistered) return;
  hooksRegistered = true;

  Hooks.on("drawNote", bindScriptoriaNoteInteraction);
  Hooks.on("destroyNote", unbindScriptoriaNoteInteraction);
  Hooks.on("canvasTearDown", clearScriptoriaNoteInteractions);
  Hooks.on("activateNote", (note) => {
    if (!isScriptoriaSceneNote(note)) return;

    if (canManageScriptoriaNote(note)) {
      void activateAndControlScriptoriaNote(note).catch((error) => {
        console.error(`${MODULE_ID} | Unable to retain Scene document selection.`, error);
      });
    }

    const document = note?.document ?? note;
    const sourceItemUuid = document.getFlag?.(FLAG_SCOPE, "sourceItemUuid");
    if (sourceItemUuid) {
      void openDocumentView(note, {
        source: "scene"
      }).catch(notifyReaderError);
      // Runyth Scriptoria centrally resolves the configured scene reader mode.
      return false;
    }
  });

  Hooks.on("getSceneControlButtons", addSceneControlTool);
}

/**
 * Determine whether a Note document or placeable was created by Runyth Scriptoria.
 */
export function isScriptoriaSceneNote(noteOrDocument) {
  const document = noteOrDocument?.document ?? noteOrDocument;
  return document?.documentName === "Note"
    && Boolean(document.getFlag?.(FLAG_SCOPE, "sourceItemUuid"));
}

/**
 * Use Foundry's own permission checks. Game Masters and Assistant Game Masters
 * are represented by game.user.isGM; other users only receive control when the
 * Note placeable itself reports that the action is allowed.
 */
export function canManageScriptoriaNote(note, user = globalThis.game?.user) {
  if (!isScriptoriaSceneNote(note) || !user) return false;
  if (user.isGM) return true;
  if (typeof note?.can !== "function") return false;

  return Boolean(
    note.can(user, "control")
    && note.can(user, "drag")
    && note.can(user, "update")
  );
}

/**
 * Activate the native Notes scene control and control the Note placeable.
 * Foundry then owns movement, snapping, keyboard nudging, HUD/configuration,
 * persistence, and deletion.
 */
export async function activateAndControlScriptoriaNote(note) {
  if (!canManageScriptoriaNote(note)) return false;

  const noteId = note.id ?? note.document?.id;

  if (typeof ui?.controls?.activate === "function") {
    await ui.controls.activate({
      control: "notes",
      tool: "select"
    });
  } else if (canvas?.notes && !canvas.notes.active) {
    canvas.notes.activate();
  }

  const currentNote = canvas?.notes?.get?.(noteId) ?? note;
  if (!canManageScriptoriaNote(currentNote)) return false;
  return Boolean(currentNote.control?.({
    releaseOthers: true
  }));
}

/**
 * Bind one non-capturing pointer listener to the native Note container.
 * Rebinding first removes the previous listener so scene redraws cannot create
 * duplicates. No event is cancelled or stopped.
 */
export function bindScriptoriaNoteInteraction(note) {
  unbindScriptoriaNoteInteraction(note);
  if (!isScriptoriaSceneNote(note) || typeof note?.on !== "function") return false;

  const handler = (event) => {
    const button = Number(event?.button ?? event?.nativeEvent?.button ?? 0);
    const detail = Number(event?.detail ?? event?.nativeEvent?.detail ?? 1);
    if (button !== 0 || detail > 1) return;
    if (!canManageScriptoriaNote(note)) return;

    void activateAndControlScriptoriaNote(note).catch((error) => {
      console.error(`${MODULE_ID} | Unable to select a Scene document Note.`, error);
    });
  };

  note.on("pointertap", handler);
  interactionBindings.set(note, handler);
  return true;
}

/**
 * Remove the listener associated with one Note placeable.
 */
export function unbindScriptoriaNoteInteraction(note) {
  const handler = interactionBindings.get(note);
  if (!handler) return false;

  note.off?.("pointertap", handler);
  interactionBindings.delete(note);
  return true;
}

/**
 * Remove every registered listener during Canvas teardown.
 */
export function clearScriptoriaNoteInteractions() {
  for (const [note, handler] of interactionBindings) {
    note.off?.("pointertap", handler);
  }
  interactionBindings.clear();
}

export function getSceneNoteInteractionBindingCount() {
  return interactionBindings.size;
}

function addSceneControlTool(controls) {
  const tools = controls?.tokens?.tools;
  if (!tools || tools.runythScriptoriaNotes) return;

  tools.runythScriptoriaNotes = {
    name: "runythScriptoriaNotes",
    title: localize("RUNYTH-SCRIPTORIA.Scene.ManageDocuments", "Manage Runyth Scriptoria scene documents"),
    icon: "fa-solid fa-book-open-reader",
    order: Object.keys(tools).length,
    button: true,
    visible: Boolean(game.user?.isGM),
    onChange: () => {
      void activateScriptoriaNotesLayer().catch((error) => {
        console.error(`${MODULE_ID} | Unable to activate the Notes layer.`, error);
        ui.notifications?.error?.(localize("RUNYTH-SCRIPTORIA.Errors.ActivateSceneControls", "Unable to activate Runyth Scriptoria Scene document controls."));
      });
    }
  };
}

async function activateScriptoriaNotesLayer() {
  if (typeof ui?.controls?.activate === "function") {
    await ui.controls.activate({
      control: "notes",
      tool: "select"
    });
    return;
  }

  canvas?.notes?.activate?.();
}
