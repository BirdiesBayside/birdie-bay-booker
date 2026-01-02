import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
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
import { CourseSelector } from "./CourseSelector";

const tournamentFormSchema = z.object({
  tournamentname: z.string().min(1, "Tournament name is required"),
  courseId: z.number({ required_error: "Course is required" }),
  startdate: z.date({ required_error: "Start date is required" }),
  enddate: z.date({ required_error: "End date is required" }),
  tourId: z.string().min(1, "Tour is required"),
});

type TournamentFormValues = z.infer<typeof tournamentFormSchema>;

interface Tour {
  tour_id: number;
  name: string;
}

interface TournamentFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tournament?: {
    tournament_id: number;
    name: string;
    course_name?: string | null;
    start_date?: string | null;
    end_date?: string | null;
    tour_id: number;
  };
  tours: Tour[];
  defaultTourId?: number;
}

export function TournamentFormDialog({
  open,
  onOpenChange,
  tournament,
  tours,
  defaultTourId,
}: TournamentFormDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedCourseName, setSelectedCourseName] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const isEditing = !!tournament;

  const form = useForm<TournamentFormValues>({
    resolver: zodResolver(tournamentFormSchema),
    defaultValues: {
      tournamentname: "",
      courseId: undefined,
      startdate: undefined,
      enddate: undefined,
      tourId: defaultTourId?.toString() || "",
    },
  });

  // Reset form when dialog opens with tournament data
  useEffect(() => {
    if (open) {
      if (tournament) {
        form.reset({
          tournamentname: tournament.name,
          courseId: undefined, // Course ID not available in edit mode
          startdate: tournament.start_date ? new Date(tournament.start_date) : undefined,
          enddate: tournament.end_date ? new Date(tournament.end_date) : undefined,
          tourId: tournament.tour_id.toString(),
        });
        setSelectedCourseName(tournament.course_name || null);
      } else {
        form.reset({
          tournamentname: "",
          courseId: undefined,
          startdate: undefined,
          enddate: undefined,
          tourId: defaultTourId?.toString() || "",
        });
        setSelectedCourseName(null);
      }
    }
  }, [open, tournament, defaultTourId, form]);

  const onSubmit = async (values: TournamentFormValues) => {
    setIsSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("sgt-member-management", {
        body: {
          action: isEditing ? "edit-tournament" : "create-tournament",
          ...(isEditing ? { tournamentId: tournament.tournament_id } : {}),
          tournamentname: values.tournamentname,
          courseId: values.courseId,
          startdate: format(values.startdate, "yyyy-MM-dd"),
          enddate: format(values.enddate, "yyyy-MM-dd"),
          tourId: parseInt(values.tourId),
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast({
        title: isEditing ? "Tournament updated" : "Tournament created",
        description: data.feedback || `Tournament "${values.tournamentname}" has been ${isEditing ? "updated" : "created"} successfully.`,
      });

      queryClient.invalidateQueries({ queryKey: ["sgt-tournaments"] });
      onOpenChange(false);
    } catch (error) {
      console.error("Tournament form error:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to save tournament",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Tournament" : "Create Tournament"}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update the tournament details below."
              : "Fill in the details to create a new tournament."}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="tournamentname"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tournament Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter tournament name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="tourId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tour</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a tour" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {tours.map((tour) => (
                        <SelectItem key={tour.tour_id} value={tour.tour_id.toString()}>
                          {tour.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="courseId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Course</FormLabel>
                  <FormControl>
                    <CourseSelector
                      value={field.value}
                      onSelect={(courseId, course) => {
                        field.onChange(courseId);
                        setSelectedCourseName(course.name);
                      }}
                      placeholder="Search and select a course..."
                    />
                  </FormControl>
                  {selectedCourseName && !field.value && (
                    <p className="text-sm text-muted-foreground">
                      Current: {selectedCourseName}
                    </p>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="startdate"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Start Date</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className={cn(
                              "w-full pl-3 text-left font-normal",
                              !field.value && "text-muted-foreground"
                            )}
                          >
                            {field.value ? format(field.value, "PPP") : "Pick a date"}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          initialFocus
                          className="pointer-events-auto"
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="enddate"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>End Date</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className={cn(
                              "w-full pl-3 text-left font-normal",
                              !field.value && "text-muted-foreground"
                            )}
                          >
                            {field.value ? format(field.value, "PPP") : "Pick a date"}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          initialFocus
                          className="pointer-events-auto"
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting
                  ? isEditing
                    ? "Updating..."
                    : "Creating..."
                  : isEditing
                  ? "Update Tournament"
                  : "Create Tournament"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
