import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { createUserInBackground, createUsersFromCsv, listUsersFirestore, setUserRoleFirestore, deleteUserFirestore, suspendUserFirestore } from "@/lib/users-firestore";
import { useCurrentUser, useAuthStore } from "@/lib/auth-store";
import { Trash2, Loader2, RefreshCw, Plus, Eye, Pencil, Ban, Check } from "lucide-react";

export const Route = createFileRoute("/_app/users")({
  head: () => ({ meta: [{ title: "Users · Admin" }] }),
  component: UsersPage,
});

const USERS_QK = ["admin", "users"] as const;

function UsersPage() {
  const qc = useQueryClient();
  const currentUser = useCurrentUser();

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: USERS_QK,
    queryFn: () => listUsersFirestore(),
  });

  const [busyId, setBusyId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [viewingUser, setViewingUser] = useState<any>(null);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [suspendingUser, setSuspendingUser] = useState<any>(null);
  const [createForm, setCreateForm] = useState({ fullName: "", email: "", password: "", confirm: "", role: "officer" as "admin" | "officer" | "permit_holder" });
  const [createError, setCreateError] = useState("");
  const [createBusy, setCreateBusy] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importBusy, setImportBusy] = useState(false);

  const users = (data ?? []).filter((u: any) => u.id !== currentUser?.id);

  const doSetRole = async (userId: string, role: string) => {
    setBusyId(userId);
    try {
      await setUserRoleFirestore(userId, role);
      toast.success("Role updated");
      await qc.invalidateQueries({ queryKey: USERS_QK });
    } catch (err) {
      toast.error((err as Error).message ?? "Failed to update role");
    } finally {
      setBusyId(null);
    }
  };

  const doSuspend = async (userId: string, suspend: boolean) => {
    setBusyId(userId);
    try {
      await suspendUserFirestore(userId, suspend);
      toast.success(suspend ? "User suspended" : "User restored");
      setSuspendingUser(null);
      await qc.invalidateQueries({ queryKey: USERS_QK });
    } catch (err) {
      toast.error((err as Error).message ?? "Failed to update account status");
    } finally {
      setBusyId(null);
    }
  };

  const doDelete = async (userId: string) => {
    if (!confirm("Delete this user? This cannot be undone.")) return;
    setBusyId(userId);
    try {
      await deleteUserFirestore(userId);
      toast.success("User deleted");
      await qc.invalidateQueries({ queryKey: USERS_QK });
    } catch (err) {
      toast.error((err as Error).message ?? "Failed to delete user");
    } finally {
      setBusyId(null);
    }
  };

  const generateTempPassword = () => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*";
    return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  };

  const doCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError("");
    if (!createForm.fullName || !createForm.email || !createForm.password) return setCreateError("Please fill all fields.");
    if (createForm.password.length < 6) return setCreateError("Password must be at least 6 characters.");
    if (createForm.password !== createForm.confirm) return setCreateError("Passwords do not match.");
    setCreateBusy(true);
    const r = await createUserInBackground({
      fullName: createForm.fullName,
      email: createForm.email,
      password: createForm.password,
      role: createForm.role,
      createdBy: { id: currentUser?.id ?? "", email: currentUser?.email },
    });
    setCreateBusy(false);
    if (!r.ok) return setCreateError(r.error);
    toast.success("User created successfully.");
    setCreateForm({ fullName: "", email: "", password: "", confirm: "", role: "officer" });
    setCreateOpen(false);
    await qc.invalidateQueries({ queryKey: USERS_QK });
  };

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <p className="text-sm text-muted-foreground">Administration</p>
          <h1 className="text-3xl font-semibold tracking-tight">Users</h1>
          <p className="text-muted-foreground">Manage application users and roles.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="ghost" size="icon" onClick={() => void refetch()} title="Refresh">
            <RefreshCw className={`size-4 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
          <Button variant="secondary" onClick={() => setImportOpen(true)}>
            Import users
          </Button>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="size-4 mr-2" /> Create User
          </Button>
        </div>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3">Name</th>
                <th className="text-left px-4 py-3">Email</th>
                <th className="text-left px-4 py-3">Role</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-right px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">
                    <Loader2 className="size-5 animate-spin inline mr-2" /> Loading users…
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-destructive">
                    Failed to load users. {(error as Error).message}
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">
                    No other users found.
                  </td>
                </tr>
              ) : (
                users.map((u: any) => (
                  <tr key={u.id} className="border-t border-border hover:bg-secondary/30">
                    <td className="px-4 py-3 font-medium">{u.fullName ?? "Unknown"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{u.email ?? u.id}</td>
                    <td className="px-4 py-3">
                      <div className="w-40">
                        <Select value={u.role ?? "officer"} onValueChange={(v) => void doSetRole(u.id, v)}>
                          <SelectTrigger className="w-full" disabled={busyId === u.id}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="admin">Administrator</SelectItem>
                            <SelectItem value="officer">Enforcement officer</SelectItem>
                            <SelectItem value="permit_holder">Permit Holder</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {u.suspended ? (
                        <span className="text-xs font-medium px-2 py-1 rounded-full bg-destructive/10 text-destructive">Suspended</span>
                      ) : (
                        <span className="text-xs font-medium px-2 py-1 rounded-full bg-green-500/10 text-green-700">Active</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => setViewingUser(u)} title="View details" disabled={busyId === u.id}>
                          <Eye className="size-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingUser(u)} title="Edit" disabled={busyId === u.id}>
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setSuspendingUser(u)}
                          title={u.suspended ? "Restore account" : "Suspend account"}
                          disabled={busyId === u.id}
                        >
                          {u.suspended ? <Check className="size-3.5 text-green-600" /> : <Ban className="size-3.5 text-yellow-600" />}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => doDelete(u.id)} disabled={busyId === u.id}>
                          <Trash2 className="size-3.5 text-destructive" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Create User Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create new user</DialogTitle>
            <DialogDescription>Register a new administrator, enforcement officer, or permit holder.</DialogDescription>
          </DialogHeader>
          <form onSubmit={doCreateUser} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="create-name">Full name</Label>
              <Input
                id="create-name"
                value={createForm.fullName}
                onChange={(e) => setCreateForm({ ...createForm, fullName: e.target.value })}
                placeholder="e.g. Thandi Mokoena"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="create-email">Email</Label>
              <Input
                id="create-email"
                type="email"
                value={createForm.email}
                onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                placeholder="you@homeaffairs.gov.za"
                autoComplete="email"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <div className="grid grid-cols-3 gap-2">
                {(["officer", "admin", "permit_holder"] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setCreateForm({ ...createForm, role: r })}
                    className={`p-2 rounded-md border text-left text-sm transition-colors ${
                      createForm.role === r ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
                    }`}
                  >
                    <div className="font-medium capitalize">
                      {r === "admin" ? "Administrator" : r === "permit_holder" ? "Permit Holder" : "Officer"}
                    </div>
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="create-password">Password</Label>
                <Input
                  id="create-password"
                  type="password"
                  value={createForm.password}
                  onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                  autoComplete="new-password"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="create-confirm">Confirm</Label>
                <Input
                  id="create-confirm"
                  type="password"
                  value={createForm.confirm}
                  onChange={(e) => setCreateForm({ ...createForm, confirm: e.target.value })}
                  autoComplete="new-password"
                />
              </div>
            </div>
            <div className="flex gap-2 items-center">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const generated = generateTempPassword();
                  setCreateForm({ ...createForm, password: generated, confirm: generated });
                }}
              >
                Generate temporary password
              </Button>
              <span className="text-sm text-muted-foreground">Use this to provide a secure one-time password.</span>
            </div>
            {createError && <p className="text-sm text-destructive">{createError}</p>}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setCreateOpen(false)} disabled={createBusy}>
                Cancel
              </Button>
              <Button type="submit" disabled={createBusy}>
                {createBusy && <Loader2 className="size-4 mr-1 animate-spin" />} Create account
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Import users</DialogTitle>
            <DialogDescription>
              Upload a CSV file with columns: email, fullName, role, password.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-md border border-border p-4 bg-secondary/5">
              <p className="text-sm text-muted-foreground">
                Download the sample CSV template if you need a starting point.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const sample = `email,fullName,role,password\nuser1@example.com,Thabo Ndlovu,officer,Password123!\nuser2@example.com,Zanele Khumalo,permit_holder,Password123!`;
                  const blob = new Blob([sample], { type: "text/csv" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = "user-import-template.csv";
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  URL.revokeObjectURL(url);
                }}
              >
                Download template
              </Button>
            </div>
            <div>
              <label className="sr-only" htmlFor="user-import-csv">Upload CSV</label>
              <input
                id="user-import-csv"
                type="file"
                accept=".csv"
                aria-label="Upload user CSV import file"
                onChange={async (event) => {
                  setImportError(null);
                  const file = event.target.files?.[0];
                  if (!file) return;
                  setImportBusy(true);
                  try {
                    const contents = await file.text();
                    const result = await createUsersFromCsv(contents, {
                      id: currentUser?.id ?? "",
                      email: currentUser?.email,
                    });
                    if (!result.ok) {
                      setImportError(result.errors.join(" "));
                    } else {
                      toast.success(`${result.created} account(s) created`);
                      await qc.invalidateQueries({ queryKey: USERS_QK });
                      setImportOpen(false);
                    }
                  } catch (err) {
                    setImportError((err as Error).message || "Upload failed.");
                  } finally {
                    setImportBusy(false);
                  }
                }}
              />
            </div>
            {importError && <p className="text-sm text-destructive">{importError}</p>}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setImportOpen(false)} disabled={importBusy}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View User Details Dialog */}
      <Dialog open={!!viewingUser} onOpenChange={(o) => !o && setViewingUser(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>User details</DialogTitle>
          </DialogHeader>
          {viewingUser && (
            <div className="space-y-4 text-sm">
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Full name</div>
                <div className="mt-1 font-medium">{viewingUser.fullName ?? "Unknown"}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Email</div>
                <div className="mt-1 font-medium">{viewingUser.email ?? viewingUser.id}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Role</div>
                <div className="mt-1 font-medium capitalize">
                  {viewingUser.role === "admin"
                    ? "Administrator"
                    : viewingUser.role === "permit_holder"
                    ? "Permit Holder"
                    : "Enforcement officer"}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Status</div>
                <div className="mt-1 font-medium">
                  {viewingUser.suspended ? <span className="text-destructive">Suspended</span> : <span className="text-green-700">Active</span>}
                </div>
              </div>
              {viewingUser.createdAt && (
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Created</div>
                  <div className="mt-1 font-medium">{new Date(viewingUser.createdAt.toDate?.() ?? viewingUser.createdAt).toLocaleDateString()}</div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setViewingUser(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={!!editingUser} onOpenChange={(o) => !o && setEditingUser(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit user</DialogTitle>
          </DialogHeader>
          {editingUser && (
            <div className="space-y-4 text-sm">
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Full name</div>
                <div className="mt-1 font-medium">{editingUser.fullName ?? "Unknown"}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Email</div>
                <div className="mt-1 font-medium">{editingUser.email ?? editingUser.id}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Role</div>
                <div className="mt-1">
                  <Select
                    value={editingUser.role ?? "officer"}
                    onValueChange={(v) => setEditingUser({ ...editingUser, role: v })}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Administrator</SelectItem>
                      <SelectItem value="officer">Enforcement officer</SelectItem>
                      <SelectItem value="permit_holder">Permit Holder</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setEditingUser(null)}
              disabled={busyId === editingUser?.id}
            >
              Cancel
            </Button>
            <Button
              onClick={async () => {
                if (editingUser) {
                  await doSetRole(editingUser.id, editingUser.role);
                  setEditingUser(null);
                }
              }}
              disabled={busyId === editingUser?.id}
            >
              {busyId === editingUser?.id && <Loader2 className="size-4 mr-1 animate-spin" />} Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Suspend User Confirmation */}
      <AlertDialog open={!!suspendingUser} onOpenChange={(o) => !o && setSuspendingUser(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {suspendingUser?.suspended ? "Restore user account?" : "Suspend user account?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {suspendingUser?.suspended
                ? `${suspendingUser?.fullName ?? "This user"} will be able to sign in again.`
                : `${suspendingUser?.fullName ?? "This user"} will not be able to sign in or access the system.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busyId === suspendingUser?.id}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (suspendingUser) doSuspend(suspendingUser.id, !suspendingUser.suspended);
              }}
              disabled={busyId === suspendingUser?.id}
              className={suspendingUser?.suspended ? "" : "bg-yellow-600 hover:bg-yellow-700"}
            >
              {busyId === suspendingUser?.id && <Loader2 className="size-4 mr-1 animate-spin" />}
              {suspendingUser?.suspended ? "Restore" : "Suspend"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
