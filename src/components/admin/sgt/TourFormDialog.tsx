import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CalendarIcon, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

interface Tour {
  id: string;
  tour_id: number;
  name: string;
  active: number;
  start_date: string | null;
  end_date: string | null;
  team_tour: number | null;
}

interface TourFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tour?: Tour | null; // null/undefined = create mode, Tour = edit mode
}

interface TourFormData {
  tourname: string;
  startdate: Date;
  enddate: Date;
  active: boolean;
  tourtype: "0" | "1"; // 0 = individual, 1 = team
  tourpublic: boolean;
}

export function TourFormDialog({ open, onOpenChange, tour }: TourFormDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isEditing = !!tour;

  const [formData, setFormData] = useState<TourFormData>({
    tourname: "",
    startdate: new Date(),
    enddate: new Date(new Date().getFullYear(), 11, 31),
    active: true,
    tourtype: "0",
    tourpublic: false,
  });

  // Reset form when dialog opens/closes or tour changes
  useEffect(() => {
    if (open) {
      if (tour) {
        setFormData({
          tourname: tour.name,
          startdate: tour.start_date ? new Date(tour.start_date) : new Date(),
          enddate: tour.end_date ? new Date(tour.end_date) : new Date(new Date().getFullYear(), 11, 31),
          active: tour.active === 1,
          tourtype: tour.team_tour === 1 ? "1" : "0",
          tourpublic: false, // API doesn't return this, default to false
        });
      } else {
        setFormData({
          tourname: "",
          startdate: new Date(),
          enddate: new Date(new Date().getFullYear(), 11, 31),
          active: true,
          tourtype: "0",
          tourpublic: false,
        });
      }
    }
  }, [open, tour]);

  const createTour = useMutation({
    mutationFn: async (data: TourFormData) => {
      const { data: result, error } = await supabase.functions.invoke("sgt-member-management", {
        body: {
          action: "create-tour",
          tourname: data.tourname.trim(),
          startdate: format(data.startdate, "yyyy-MM-dd"),
          enddate: format(data.enddate, "yyyy-MM-dd"),
          active: data.active ? 1 : 0,
          tourtype: parseInt(data.tourtype),
          tourpublic: data.tourpublic ? 1 : 0,
        },
      });
      if (error) throw error;
      if (!result.success) throw new Error(result.feedback || "Failed to create tour");
      return result;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["sgt-tours"] });
      toast({
        title: "Tour created",
        description: `Tour "${formData.tourname}" has been created successfully`,
      });
      onOpenChange(false);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create tour",
        variant: "destructive",
      });
    },
  });

  const editTour = useMutation({
    mutationFn: async (data: TourFormData & { tourId: number }) => {
      const { data: result, error } = await supabase.functions.invoke("sgt-member-management", {
        body: {
          action: "edit-tour",
          tourId: data.tourId,
          tourname: data.tourname.trim(),
          startdate: format(data.startdate, "yyyy-MM-dd"),
          enddate: format(data.enddate, "yyyy-MM-dd"),
          active: data.active ? 1 : 0,
          tourtype: parseInt(data.tourtype),
          tourpublic: data.tourpublic ? 1 : 0,
        },
      });
      if (error) throw error;
      if (!result.success) throw new Error(result.feedback || "Failed to update tour");
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sgt-tours"] });
      toast({
        title: "Tour updated",
        description: `Tour "${formData.tourname}" has been updated successfully`,
      });
      onOpenChange(false);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update tour",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.tourname.trim()) {
      toast({
        title: "Validation error",
        description: "Tour name is required",
        variant: "destructive",
      });
      return;
    }

    if (formData.enddate < formData.startdate) {
      toast({
        title: "Validation error",
        description: "End date must be after start date",
        variant: "destructive",
      });
      return;
    }

    if (isEditing && tour) {
      editTour.mutate({ ...formData, tourId: tour.tour_id });
    } else {
      createTour.mutate(formData);
    }
  };

  const isPending = createTour.isPending || editTour.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Tour" : "Create Tour"}</DialogTitle>
          <DialogDescription>
            {isEditing 
              ? "Update the tour details below" 
              : "Fill in the details to create a new tour"}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Tour Name */}
          <div className="space-y-2">
            <Label htmlFor="tourname">Tour Name</Label>
            <Input
              id="tourname"
              value={formData.tourname}
              onChange={(e) => setFormData({ ...formData, tourname: e.target.value })}
              placeholder="Enter tour name"
              maxLength={100}
              required
            />
          </div>

          {/* Start Date */}
          <div className="space-y-2">
            <Label>Start Date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !formData.startdate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {formData.startdate ? format(formData.startdate, "PPP") : "Pick a date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={formData.startdate}
                  onSelect={(date) => date && setFormData({ ...formData, startdate: date })}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* End Date */}
          <div className="space-y-2">
            <Label>End Date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !formData.enddate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {formData.enddate ? format(formData.enddate, "PPP") : "Pick a date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={formData.enddate}
                  onSelect={(date) => date && setFormData({ ...formData, enddate: date })}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Tour Type */}
          <div className="space-y-2">
            <Label>Tour Type</Label>
            <Select
              value={formData.tourtype}
              onValueChange={(value: "0" | "1") => setFormData({ ...formData, tourtype: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0">Individual Tour</SelectItem>
                <SelectItem value="1">Team Tour</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Active Toggle */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="active">Active</Label>
              <p className="text-sm text-muted-foreground">Tour is visible and active</p>
            </div>
            <Switch
              id="active"
              checked={formData.active}
              onCheckedChange={(checked) => setFormData({ ...formData, active: checked })}
            />
          </div>

          {/* Public Registration Toggle (only for individual tours) */}
          {formData.tourtype === "0" && (
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="tourpublic">Public Registration</Label>
                <p className="text-sm text-muted-foreground">Allow any user to register</p>
              </div>
              <Switch
                id="tourpublic"
                checked={formData.tourpublic}
                onCheckedChange={(checked) => setFormData({ ...formData, tourpublic: checked })}
              />
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEditing ? "Update Tour" : "Create Tour"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
