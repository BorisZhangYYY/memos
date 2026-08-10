import { create, type MessageInitShape } from "@bufbuild/protobuf";
import { FieldMaskSchema, timestampFromDate } from "@bufbuild/protobuf/wkt";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { financeServiceClient } from "@/connect";
import {
  FinanceCategorySchema,
  type FinanceTransaction,
  FinanceTransactionSchema,
  FinanceWalletSchema,
} from "@/types/proto/api/v1/finance_service_pb";

type FinanceWalletInput = MessageInitShape<typeof FinanceWalletSchema>;
type FinanceCategoryInput = MessageInitShape<typeof FinanceCategorySchema>;
type FinanceTransactionInput = MessageInitShape<typeof FinanceTransactionSchema>;

export const financeKeys = {
  all: ["finance"] as const,
  wallets: (parent: string) => [...financeKeys.all, "wallets", parent] as const,
  categories: (parent: string) => [...financeKeys.all, "categories", parent] as const,
  transactions: (parent: string) => [...financeKeys.all, "transactions", parent] as const,
  summary: (parent: string, start: Date, end: Date, timeZone: string) =>
    [...financeKeys.all, "summary", parent, start.toISOString(), end.toISOString(), timeZone] as const,
};

export const useFinanceWallets = (parent?: string) =>
  useQuery({
    queryKey: financeKeys.wallets(parent ?? ""),
    queryFn: () => financeServiceClient.listFinanceWallets({ parent }),
    enabled: !!parent,
    select: (response) => response.wallets,
  });

export const useFinanceCategories = (parent?: string) =>
  useQuery({
    queryKey: financeKeys.categories(parent ?? ""),
    queryFn: () => financeServiceClient.listFinanceCategories({ parent }),
    enabled: !!parent,
    select: (response) => response.categories,
  });

export const useFinanceSummary = (parent: string | undefined, start: Date, end: Date, timeZone: string) =>
  useQuery({
    queryKey: financeKeys.summary(parent ?? "", start, end, timeZone),
    queryFn: () =>
      financeServiceClient.getFinanceSummary({
        parent,
        startTime: timestampFromDate(start),
        endTime: timestampFromDate(end),
        timeZone,
      }),
    enabled: !!parent,
  });

export const useFinanceTransactions = (parent?: string, options?: { start?: Date; end?: Date; pageSize?: number }) =>
  useQuery({
    queryKey: [...financeKeys.transactions(parent ?? ""), options?.start?.toISOString(), options?.end?.toISOString(), options?.pageSize],
    queryFn: () =>
      financeServiceClient.listFinanceTransactions({
        parent,
        startTime: options?.start ? timestampFromDate(options.start) : undefined,
        endTime: options?.end ? timestampFromDate(options.end) : undefined,
        pageSize: options?.pageSize,
      }),
    enabled: !!parent,
    select: (response) => response.transactions,
  });

export const useFinanceTransactionHistory = (parent?: string, enabled = true) =>
  useQuery({
    queryKey: [...financeKeys.transactions(parent ?? ""), "complete-history"],
    queryFn: async () => {
      const transactions: FinanceTransaction[] = [];
      const seenTokens = new Set<string>();
      let pageToken = "";
      do {
        const response = await financeServiceClient.listFinanceTransactions({ parent, pageSize: 100, pageToken });
        transactions.push(...response.transactions);
        if (!response.nextPageToken || seenTokens.has(response.nextPageToken)) break;
        seenTokens.add(response.nextPageToken);
        pageToken = response.nextPageToken;
      } while (pageToken);
      return transactions;
    },
    enabled: !!parent && enabled,
  });

const useInvalidateFinance = () => {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: financeKeys.all });
};

export const useCreateFinanceWallet = () => {
  const invalidate = useInvalidateFinance();
  return useMutation({
    mutationFn: ({ parent, wallet }: { parent: string; wallet: FinanceWalletInput }) =>
      financeServiceClient.createFinanceWallet({ parent, wallet: create(FinanceWalletSchema, wallet), requestId: crypto.randomUUID() }),
    onSuccess: invalidate,
  });
};

export const useUpdateFinanceWallet = () => {
  const invalidate = useInvalidateFinance();
  return useMutation({
    mutationFn: ({ wallet, updateMask }: { wallet: FinanceWalletInput; updateMask: string[] }) =>
      financeServiceClient.updateFinanceWallet({
        wallet: create(FinanceWalletSchema, wallet),
        updateMask: create(FieldMaskSchema, { paths: updateMask }),
      }),
    onSuccess: invalidate,
  });
};

export const useCreateFinanceCategory = () => {
  const invalidate = useInvalidateFinance();
  return useMutation({
    mutationFn: ({ parent, category }: { parent: string; category: FinanceCategoryInput }) =>
      financeServiceClient.createFinanceCategory({
        parent,
        category: create(FinanceCategorySchema, category),
        requestId: crypto.randomUUID(),
      }),
    onSuccess: invalidate,
  });
};

export const useUpdateFinanceCategory = () => {
  const invalidate = useInvalidateFinance();
  return useMutation({
    mutationFn: ({ category, updateMask }: { category: FinanceCategoryInput; updateMask: string[] }) =>
      financeServiceClient.updateFinanceCategory({
        category: create(FinanceCategorySchema, category),
        updateMask: create(FieldMaskSchema, { paths: updateMask }),
      }),
    onSuccess: invalidate,
  });
};

export const useCreateFinanceTransaction = () => {
  const invalidate = useInvalidateFinance();
  return useMutation({
    mutationFn: ({ parent, transaction }: { parent: string; transaction: FinanceTransactionInput }) =>
      financeServiceClient.createFinanceTransaction({
        parent,
        transaction: create(FinanceTransactionSchema, transaction),
        requestId: crypto.randomUUID(),
      }),
    onSuccess: invalidate,
  });
};

export const useAdjustFinanceWalletBalance = () => {
  const invalidate = useInvalidateFinance();
  return useMutation({
    mutationFn: ({ wallet, actualBalanceMinor, note }: { wallet: string; actualBalanceMinor: bigint; note: string }) =>
      financeServiceClient.adjustFinanceWalletBalance({
        wallet,
        actualBalanceMinor,
        note,
        occurTime: timestampFromDate(new Date()),
        requestId: crypto.randomUUID(),
      }),
    onSuccess: invalidate,
  });
};
