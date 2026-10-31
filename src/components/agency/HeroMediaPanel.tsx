"use client";

import { useState } from "react";
import { removeHeroAvatarAction, uploadHeroAvatarAction } from "@/app/agencia/herois/actions";
import { HeroCoverPicker } from "@/components/creator/HeroCoverPicker";
import { AvatarPhotoPicker } from "@/components/me/AvatarPhotoPicker";
import type { AvatarPhotoState } from "@/lib/avatar/availability";
import type { HeroCoverState } from "@/lib/hero-cover/availability";

type Props = {
  name: string;
  avatarUrl: string | null;
  coverUrl: string | null;
  avatarState: AvatarPhotoState;
  coverState: HeroCoverState;
  avatarHint: string;
};

// Foto e capa do herói escolhido pela agência (0070): os mesmos seletores do perfil, com as ações do herói.
export function HeroMediaPanel({ name, avatarUrl, coverUrl, avatarState, coverState, avatarHint }: Props) {
  const [avatar, setAvatar] = useState(avatarUrl);
  const [cover, setCover] = useState(coverUrl);
  return (
    <div className="flex flex-col gap-6">
      <AvatarPhotoPicker
        value={avatar}
        name={name}
        state={{ ...avatarState, canRemove: Boolean(avatar) }}
        onChange={setAvatar}
        hint={avatarHint}
        uploadAction={uploadHeroAvatarAction}
        removeAction={removeHeroAvatarAction}
      />
      <HeroCoverPicker value={cover} state={{ ...coverState, canRemove: Boolean(cover) }} onChange={setCover} />
    </div>
  );
}
