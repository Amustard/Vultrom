package net.vultrom.item;

import java.util.ArrayList;
import java.util.List;

import net.minecraft.core.component.DataComponents;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.server.network.Filterable;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.component.WritableBookContent;
import net.minecraft.world.level.Level;

import net.vultrom.component.BookPhotos;
import net.vultrom.component.ModComponents;
import net.vultrom.component.PhotoData;

/**
 * Developed photo. Use while holding a Book and Quill in the other hand to insert it.
 * Alone: client opens a viewer (see client handler).
 */
public class PhotoItem extends Item {
	public PhotoItem(Properties properties) {
		super(properties);
	}

	@Override
	public InteractionResult use(Level level, Player player, InteractionHand hand) {
		ItemStack photoStack = player.getItemInHand(hand);
		InteractionHand otherHand = hand == InteractionHand.MAIN_HAND ? InteractionHand.OFF_HAND : InteractionHand.MAIN_HAND;
		ItemStack other = player.getItemInHand(otherHand);
		PhotoData data = photoStack.get(ModComponents.PHOTO);
		if (data == null) {
			return InteractionResult.FAIL;
		}

		if (other.is(Items.WRITABLE_BOOK)) {
			if (level.isClientSide()) {
				return InteractionResult.SUCCESS;
			}
			BookPhotos current = other.getOrDefault(ModComponents.BOOK_PHOTOS, BookPhotos.EMPTY);
			if (current.photos().size() >= BookPhotos.MAX_PHOTOS) {
				if (player instanceof ServerPlayer sp) {
					sp.sendOverlayMessage(Component.literal("This book is full of photos."));
				}
				return InteractionResult.FAIL;
			}
			BookPhotos next = current.withAdded(data);
			other.set(ModComponents.BOOK_PHOTOS, next);

			WritableBookContent content = other.getOrDefault(DataComponents.WRITABLE_BOOK_CONTENT, WritableBookContent.EMPTY);
			List<Filterable<String>> pages = new ArrayList<>(content.pages());
			pages.add(Filterable.passThrough(
					"[Photo " + next.photos().size() + "]\nSneak + use this book to view attached photos."
			));
			other.set(DataComponents.WRITABLE_BOOK_CONTENT, new WritableBookContent(pages));

			photoStack.shrink(1);
			if (player instanceof ServerPlayer sp) {
				sp.sendOverlayMessage(Component.literal("Photo tucked into Book and Quill"));
				sp.sendSystemMessage(Component.literal(
						"Photo inserted. Sneak + right-click the book to flip through photos."
				));
			}
			return InteractionResult.SUCCESS;
		}

		// View photo — client screen is opened from UseItemCallback.
		return InteractionResult.SUCCESS;
	}
}
