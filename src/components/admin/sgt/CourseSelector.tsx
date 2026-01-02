import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
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
import { Check, ChevronsUpDown, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";

interface Course {
  id: string;
  course_id: number;
  name: string;
  par: number | null;
  difficulty: number | null;
  course_designer: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  thumbnail_url: string | null;
}

interface CourseSelectorProps {
  value?: number;
  onSelect: (courseId: number, course: Course) => void;
  placeholder?: string;
  disabled?: boolean;
}

export function CourseSelector({
  value,
  onSelect,
  placeholder = "Select a course...",
  disabled = false,
}: CourseSelectorProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [countryFilter, setCountryFilter] = useState("all");

  // Fetch courses - need to fetch all since Supabase has 1000 row default limit
  const { data: courses, isLoading } = useQuery({
    queryKey: ["sgt-courses"],
    queryFn: async () => {
      // Fetch in batches to get all courses (over 2000)
      const allCourses: Course[] = [];
      let offset = 0;
      const batchSize = 1000;
      
      while (true) {
        const { data, error } = await supabase
          .from("sgt_courses")
          .select("id, course_id, name, par, difficulty, course_designer, city, state, country, thumbnail_url")
          .order("name")
          .range(offset, offset + batchSize - 1);
        
        if (error) throw error;
        if (!data || data.length === 0) break;
        
        allCourses.push(...(data as Course[]));
        
        if (data.length < batchSize) break;
        offset += batchSize;
      }
      
      return allCourses;
    },
  });

  // Get unique countries for filter
  const countries = useMemo(() => {
    if (!courses) return [];
    const countrySet = new Set<string>();
    courses.forEach((course) => {
      if (course.country) countrySet.add(course.country);
    });
    return Array.from(countrySet).sort();
  }, [courses]);

  // Filter courses
  const filteredCourses = useMemo(() => {
    if (!courses) return [];
    return courses.filter((course) => {
      const matchesSearch =
        course.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        course.city?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        course.course_designer?.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesCountry =
        countryFilter === "all" || course.country === countryFilter;

      return matchesSearch && matchesCountry;
    });
  }, [courses, searchQuery, countryFilter]);

  const selectedCourse = courses?.find((c) => c.course_id === value);

  return (
    <div className="space-y-2">
      {/* Country Filter */}
      <div className="flex gap-2">
        <Select value={countryFilter} onValueChange={setCountryFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Filter by country" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Countries</SelectItem>
            {countries.map((country) => (
              <SelectItem key={country} value={country}>
                {country}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Course Selector */}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between"
            disabled={disabled || isLoading}
          >
            {selectedCourse ? (
              <div className="flex items-center gap-2 truncate">
                <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{selectedCourse.name}</span>
                {selectedCourse.par && (
                  <span className="text-xs text-muted-foreground shrink-0">
                    (Par {selectedCourse.par})
                  </span>
                )}
              </div>
            ) : (
              <span className="text-muted-foreground">{placeholder}</span>
            )}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[400px] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Search courses..."
              value={searchQuery}
              onValueChange={setSearchQuery}
            />
            <CommandList>
              <CommandEmpty>
                {isLoading ? "Loading courses..." : "No courses found."}
              </CommandEmpty>
              <CommandGroup className="max-h-[300px] overflow-y-auto">
                {filteredCourses.slice(0, 100).map((course) => (
                  <CommandItem
                    key={course.id}
                    value={course.course_id.toString()}
                    onSelect={() => {
                      onSelect(course.course_id, course);
                      setOpen(false);
                    }}
                    className="flex items-start gap-3 py-3"
                  >
                    <Check
                      className={cn(
                        "h-4 w-4 mt-0.5 shrink-0",
                        value === course.course_id ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{course.name}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        {course.city && course.country && (
                          <span>
                            {course.city}, {course.country}
                          </span>
                        )}
                        {course.par && <span>• Par {course.par}</span>}
                        {course.difficulty && (
                          <span>• Difficulty: {course.difficulty}</span>
                        )}
                      </div>
                      {course.course_designer && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Designer: {course.course_designer}
                        </p>
                      )}
                    </div>
                  </CommandItem>
                ))}
                {filteredCourses.length > 100 && (
                  <p className="text-xs text-center text-muted-foreground py-2">
                    Showing first 100 results. Refine your search for more.
                  </p>
                )}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
