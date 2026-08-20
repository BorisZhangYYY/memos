import { Code, ConnectError } from "@connectrpc/connect";
import { useEffect } from "react";
import { toast } from "react-hot-toast";
import { useTranslate } from "@/utils/i18n";

interface UseMemoDetailErrorOptions {
  error: Error | null;
}

const useMemoDetailError = ({ error }: UseMemoDetailErrorOptions) => {
  const t = useTranslate();

  useEffect(() => {
    if (!error) {
      return;
    }

    if (error instanceof ConnectError) {
      if (error.code === Code.Unauthenticated || error.code === Code.PermissionDenied || error.code === Code.NotFound) {
        toast.error(t("message.memo-not-found"));
        return;
      }

      toast.error(error.message);
      return;
    }

    toast.error(error.message);
  }, [error, t]);
};

export default useMemoDetailError;
