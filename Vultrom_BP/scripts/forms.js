import { system } from "@minecraft/server";
import { FormCancelationReason } from "@minecraft/server-ui";

const FORM_BUSY_RETRIES = 10;
const FORM_BUSY_RETRY_TICKS = 5;

/** Shows `form`, retrying while the player is still busy with the click that opened it. */
export async function showForm(player, form) {
	for (let attempt = 0; ; attempt++) {
		const response = await form.show(player);
		if (!response.canceled || response.cancelationReason !== FormCancelationReason.UserBusy) return response;
		if (attempt >= FORM_BUSY_RETRIES || !player.isValid()) return response;
		await new Promise((resolve) => system.runTimeout(resolve, FORM_BUSY_RETRY_TICKS));
	}
}
