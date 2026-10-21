package net.vultrom.network;

import net.minecraft.network.RegistryFriendlyByteBuf;
import net.minecraft.network.codec.StreamCodec;
import net.minecraft.network.protocol.common.custom.CustomPacketPayload;

import net.vultrom.Vultrom;

/** Server → client: take a screenshot and submit a photo. */
public record RequestPhotoCapturePayload() implements CustomPacketPayload {
	public static final Type<RequestPhotoCapturePayload> TYPE = new Type<>(Vultrom.id("request_photo_capture"));
	public static final StreamCodec<RegistryFriendlyByteBuf, RequestPhotoCapturePayload> CODEC =
			StreamCodec.unit(new RequestPhotoCapturePayload());

	@Override
	public Type<? extends CustomPacketPayload> type() {
		return TYPE;
	}
}
