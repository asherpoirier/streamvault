import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import axios from "axios";
import { API, useAuth } from "@/App";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Radio,
  Plus,
  RefreshCw,
  Trash2,
  Home,
  LogOut,
  Tv,
  Layers,
  ExternalLink,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { user, token, logout } = useAuth();
  const [playlists, setPlaylists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newProviderName, setNewProviderName] = useState("");
  const [newM3u8Url, setNewM3u8Url] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [refreshingId, setRefreshingId] = useState(null);

  const authHeaders = {
    headers: { Authorization: `Bearer ${token}` },
  };

  useEffect(() => {
    fetchPlaylists();
  }, []);

  const fetchPlaylists = async () => {
    try {
      const response = await axios.get(`${API}/playlists`, authHeaders);
      setPlaylists(response.data);
    } catch (error) {
      console.error("Failed to fetch playlists:", error);
      if (error.response?.status === 401) {
        logout();
        navigate("/login");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleAddPlaylist = async (e) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const response = await axios.post(
        `${API}/playlists`,
        {
          provider_name: newProviderName,
          m3u8_url: newM3u8Url,
        },
        authHeaders
      );

      setPlaylists([...playlists, response.data]);
      setNewProviderName("");
      setNewM3u8Url("");
      setAddDialogOpen(false);
      toast.success("Playlist added!", {
        description: `${response.data.channel_count} channels imported from ${newProviderName}`,
      });
    } catch (error) {
      const message = error.response?.data?.detail || "Failed to add playlist";
      toast.error("Error", { description: message });
    } finally {
      setSubmitting(false);
    }
  };

  const handleRefreshPlaylist = async (playlistId) => {
    setRefreshingId(playlistId);

    try {
      const response = await axios.put(
        `${API}/playlists/${playlistId}/refresh`,
        {},
        authHeaders
      );

      setPlaylists(
        playlists.map((p) => (p.id === playlistId ? response.data : p))
      );
      toast.success("Playlist refreshed!", {
        description: `${response.data.channel_count} channels updated`,
      });
    } catch (error) {
      const message = error.response?.data?.detail || "Failed to refresh playlist";
      toast.error("Error", { description: message });
    } finally {
      setRefreshingId(null);
    }
  };

  const handleDeletePlaylist = async (playlistId, providerName) => {
    try {
      await axios.delete(`${API}/playlists/${playlistId}`, authHeaders);
      setPlaylists(playlists.filter((p) => p.id !== playlistId));
      toast.success("Playlist deleted", {
        description: `${providerName} has been removed`,
      });
    } catch (error) {
      const message = error.response?.data?.detail || "Failed to delete playlist";
      toast.error("Error", { description: message });
    }
  };

  const totalChannels = playlists.reduce((acc, p) => acc + p.channel_count, 0);

  return (
    <div className="min-h-screen bg-background">
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 bottom-0 w-64 bg-slate-950/50 border-r border-white/5 p-4 flex flex-col">
        <div className="flex items-center gap-3 mb-8">
          <div className="p-2 rounded-lg bg-primary/20 neon-glow">
            <Radio className="w-6 h-6 text-primary" />
          </div>
          <span className="text-xl font-semibold tracking-tight text-foreground">
            StreamVault
          </span>
        </div>

        <nav className="space-y-1 flex-1">
          <Link
            to="/"
            className="sidebar-link flex items-center gap-3 px-3 py-2 rounded-md text-slate-400"
            data-testid="nav-home"
          >
            <Home className="w-5 h-5" />
            <span>Browse Channels</span>
          </Link>
          <div className="sidebar-link active flex items-center gap-3 px-3 py-2 rounded-md">
            <Layers className="w-5 h-5" />
            <span>Manage Playlists</span>
          </div>
        </nav>

        <div className="pt-4 border-t border-white/5">
          <div className="flex items-center gap-3 px-3 py-2 mb-2">
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
              <span className="text-sm text-primary font-medium">
                {user?.username?.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">
                {user?.username}
              </p>
              <p className="text-xs text-slate-500">Admin</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={logout}
            className="w-full justify-start text-slate-400 hover:text-white hover:bg-white/5"
            data-testid="sidebar-logout"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Logout
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="ml-64 p-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-foreground mb-1">
              Playlist Management
            </h1>
            <p className="text-slate-400">
              Add and manage M3U8 playlist providers
            </p>
          </div>

          <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
            <DialogTrigger asChild>
              <Button
                className="bg-primary hover:bg-primary/90 neon-glow-hover"
                data-testid="add-playlist-btn"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Playlist
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-slate-900 border-white/10">
              <DialogHeader>
                <DialogTitle className="text-foreground">Add New Playlist</DialogTitle>
                <DialogDescription className="text-slate-400">
                  Enter the provider name and M3U8 playlist URL. Channels will
                  be automatically parsed.
                </DialogDescription>
              </DialogHeader>

              <form onSubmit={handleAddPlaylist} className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label htmlFor="provider" className="text-slate-300">
                    Provider Name
                  </Label>
                  <Input
                    id="provider"
                    value={newProviderName}
                    onChange={(e) => setNewProviderName(e.target.value)}
                    placeholder="e.g., MyIPTV Provider"
                    required
                    className="bg-slate-950/50 border-white/10 focus:border-primary/50"
                    data-testid="provider-name-input"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="m3u8url" className="text-slate-300">
                    M3U8 URL
                  </Label>
                  <Input
                    id="m3u8url"
                    type="url"
                    value={newM3u8Url}
                    onChange={(e) => setNewM3u8Url(e.target.value)}
                    placeholder="https://example.com/playlist.m3u8"
                    required
                    className="bg-slate-950/50 border-white/10 focus:border-primary/50"
                    data-testid="m3u8-url-input"
                  />
                </div>

                <DialogFooter className="mt-6">
                  <DialogClose asChild>
                    <Button
                      type="button"
                      variant="outline"
                      className="bg-transparent border-white/10"
                    >
                      Cancel
                    </Button>
                  </DialogClose>
                  <Button
                    type="submit"
                    className="bg-primary hover:bg-primary/90"
                    disabled={submitting}
                    data-testid="submit-playlist-btn"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Adding...
                      </>
                    ) : (
                      "Add Playlist"
                    )}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="glass-light rounded-lg p-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/20">
                <Layers className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-slate-400">Total Providers</p>
                <p className="text-2xl font-bold text-foreground">
                  {playlists.length}
                </p>
              </div>
            </div>
          </div>

          <div className="glass-light rounded-lg p-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-cyan-500/20">
                <Tv className="w-5 h-5 text-cyan-400" />
              </div>
              <div>
                <p className="text-sm text-slate-400">Total Channels</p>
                <p className="text-2xl font-bold text-foreground">
                  {totalChannels}
                </p>
              </div>
            </div>
          </div>

          <div className="glass-light rounded-lg p-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-500/20">
                <ExternalLink className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <p className="text-sm text-slate-400">Active Sources</p>
                <p className="text-2xl font-bold text-foreground">
                  {playlists.length}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Playlists Table */}
        <div className="glass-light rounded-lg overflow-hidden">
          <Table className="admin-table">
            <TableHeader>
              <TableRow className="border-white/5 hover:bg-transparent">
                <TableHead className="text-slate-400 font-medium">
                  Provider Name
                </TableHead>
                <TableHead className="text-slate-400 font-medium">
                  Channels
                </TableHead>
                <TableHead className="text-slate-400 font-medium">
                  M3U8 URL
                </TableHead>
                <TableHead className="text-slate-400 font-medium">
                  Last Updated
                </TableHead>
                <TableHead className="text-slate-400 font-medium text-right">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-12">
                    <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
                  </TableCell>
                </TableRow>
              ) : playlists.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="text-center py-12 text-slate-400"
                  >
                    No playlists added yet. Click "Add Playlist" to get started.
                  </TableCell>
                </TableRow>
              ) : (
                playlists.map((playlist) => (
                  <TableRow
                    key={playlist.id}
                    className="border-white/5"
                    data-testid={`playlist-row-${playlist.id}`}
                  >
                    <TableCell className="font-medium text-foreground">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-emerald-400"></div>
                        {playlist.provider_name}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="bg-white/5">
                        {playlist.channel_count} channels
                      </Badge>
                    </TableCell>
                    <TableCell className="text-slate-400 max-w-xs truncate mono text-xs">
                      {playlist.m3u8_url}
                    </TableCell>
                    <TableCell className="text-slate-400">
                      {new Date(playlist.updated_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRefreshPlaylist(playlist.id)}
                          disabled={refreshingId === playlist.id}
                          className="h-8 w-8 hover:bg-white/5"
                          title="Refresh playlist"
                          data-testid={`refresh-playlist-${playlist.id}`}
                        >
                          <RefreshCw
                            className={`w-4 h-4 ${
                              refreshingId === playlist.id
                                ? "animate-spin text-primary"
                                : "text-slate-400"
                            }`}
                          />
                        </Button>

                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 hover:bg-destructive/10"
                              title="Delete playlist"
                              data-testid={`delete-playlist-${playlist.id}`}
                            >
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent className="bg-slate-900 border-white/10">
                            <AlertDialogHeader>
                              <AlertDialogTitle className="text-foreground">
                                Delete Playlist
                              </AlertDialogTitle>
                              <AlertDialogDescription className="text-slate-400">
                                Are you sure you want to delete "
                                {playlist.provider_name}"? This will remove all{" "}
                                {playlist.channel_count} channels. This action
                                cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel className="bg-transparent border-white/10 hover:bg-white/5">
                                Cancel
                              </AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() =>
                                  handleDeletePlaylist(
                                    playlist.id,
                                    playlist.provider_name
                                  )
                                }
                                className="bg-destructive hover:bg-destructive/90"
                                data-testid={`confirm-delete-${playlist.id}`}
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </main>
    </div>
  );
}
