import { Suspense } from "react";
import { useSpaceContext } from "@/contexts/SpaceContext";
import useCurrentUser from "@/hooks/useCurrentUser";
import { useMemoFilters } from "@/hooks/useMemoFilters";
import { combineCELFilters } from "@/lib/cel-filter";
import { useTranslate } from "@/utils/i18n";
import { lazyWithReload } from "@/utils/lazy";

const UserMemoMap = lazyWithReload(() => import("@/components/UserMemoMap"));

const MapPage = () => {
  const t = useTranslate();
  const user = useCurrentUser();
  const { memoFilter } = useSpaceContext();
  const viewFilter = useMemoFilters({ includeMemoViews: true, includePinned: false });

  if (!user) return null;

  return (
    <section className="mx-auto flex min-h-full w-full max-w-6xl flex-col gap-4 px-4 pb-8 pt-4 sm:px-6">
      <h1 className="text-xl font-semibold text-foreground">{t("common.map")}</h1>
      <Suspense fallback={<div className="h-[70dvh] rounded-xl border border-border bg-muted/30" />}>
        <UserMemoMap
          creator={user.name}
          scopeFilter={combineCELFilters(memoFilter, viewFilter)}
          className="h-[70dvh] min-h-96 rounded-xl"
        />
      </Suspense>
    </section>
  );
};

export default MapPage;
