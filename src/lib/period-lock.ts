/** Check fiscal_periods status for a given date. */
export async function isPeriodLocked(
  supabase: any,
  userId: string,
  isoDate: string,
): Promise<boolean> {
  const { data } = await supabase.rpc("is_period_locked", {
    _user_id: userId,
    _date: isoDate,
  });
  return data === true;
}

export async function assertPeriodOpen(
  supabase: any,
  userId: string,
  isoDate: string,
  label = "ngày này",
): Promise<void> {
  if (await isPeriodLocked(supabase, userId, isoDate)) {
    throw new Error(`Kỳ kế toán đã khoá, không thể ghi sổ vào ${label}`);
  }
}
