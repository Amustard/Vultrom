package net.vultrom.network;

import net.minecraft.network.RegistryFriendlyByteBuf;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.network.codec.StreamCodec;
import net.minecraft.network.protocol.common.custom.CustomPacketPayload;

import net.vultrom.Vultrom;
import net.vultrom.component.PhotoData;

/** Client → server: PNG bytes for a newly taken photo. */
public record SubmitPhotoPayload(byte[] png) implements CustomPacketPayload {
	public static final Type<SubmitPhotoPayload> TYPE = new Type<>(Vultrom.id("submit_photo"));
	public static final StreamCodec<RegistryFriendlyByteBuf, SubmitPhotoPayload> CODEC = StreamCodec.composite(
			ByteBufCodecs.byteArray(PhotoData.MAX_BYTES),
			SubmitPhotoPayload::png,
			SubmitPhotoPayload::new
	);

	@Override
	public Type<? extends CustomPacketPayload> type() {
		return TYPE;
	}
}
