import { useState, useEffect, useMemo } from "react";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { 
  Search, 
  Filter, 
  MoreVertical, 
  Mail, 
  Phone, 
  User, 
  Calendar,
  Columns,
  Download
} from "lucide-react";
import { format } from "date-fns";
import { useSearchParams } from "react-router-dom";

interface Customer {
  id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  membership_tier: string;
  created_at: string;
}

interface ColumnConfig {
  key: keyof Customer | "full_name";
  label: string;
  visible: boolean;
}

const DEFAULT_COLUMNS: ColumnConfig[] = [
  { key: "first_name", label: "First Name", visible: true },
  { key: "last_name", label: "Last Name", visible: true },
  { key: "email", label: "Email", visible: true },
  { key: "phone", label: "Phone", visible: true },
  { key: "membership_tier", label: "Membership", visible: true },
  { key: "created_at", label: "Joined", visible: false },
];

export default function AdminCustomers() {
  const { isAdmin, isLoading: authLoading } = useAdminAuth();
  const [searchParams] = useSearchParams();
  
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCustomers, setSelectedCustomers] = useState<Set<string>>(new Set());
  const [columns, setColumns] = useState<ColumnConfig[]>(DEFAULT_COLUMNS);
  const [tierFilter, setTierFilter] = useState<string | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  // Check for user query param to auto-select customer
  const highlightedUserId = searchParams.get("user");

  useEffect(() => {
    if (isAdmin) {
      fetchCustomers();
    }
  }, [isAdmin]);

  useEffect(() => {
    if (highlightedUserId && customers.length > 0) {
      const customer = customers.find(c => c.user_id === highlightedUserId);
      if (customer) {
        setSelectedCustomer(customer);
      }
    }
  }, [highlightedUserId, customers]);

  const fetchCustomers = async () => {
    setIsLoading(true);
    
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .order("last_name");

    if (!error && data) {
      setCustomers(data);
    }
    
    setIsLoading(false);
  };

  const filteredCustomers = useMemo(() => {
    return customers.filter(customer => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesSearch = 
          customer.first_name?.toLowerCase().includes(query) ||
          customer.last_name?.toLowerCase().includes(query) ||
          customer.email?.toLowerCase().includes(query) ||
          customer.phone?.includes(query);
        if (!matchesSearch) return false;
      }

      // Tier filter
      if (tierFilter && customer.membership_tier !== tierFilter) {
        return false;
      }

      return true;
    });
  }, [customers, searchQuery, tierFilter]);

  const toggleCustomerSelection = (customerId: string) => {
    const newSelection = new Set(selectedCustomers);
    if (newSelection.has(customerId)) {
      newSelection.delete(customerId);
    } else {
      newSelection.add(customerId);
    }
    setSelectedCustomers(newSelection);
  };

  const toggleAllSelection = () => {
    if (selectedCustomers.size === filteredCustomers.length) {
      setSelectedCustomers(new Set());
    } else {
      setSelectedCustomers(new Set(filteredCustomers.map(c => c.id)));
    }
  };

  const toggleColumn = (key: string) => {
    setColumns(cols => cols.map(col => 
      col.key === key ? { ...col, visible: !col.visible } : col
    ));
  };

  const getMembershipColor = (tier: string) => {
    switch (tier?.toLowerCase()) {
      case "albatross": return "bg-purple-500/10 text-purple-600 border-purple-200";
      case "eagle": return "bg-amber-500/10 text-amber-600 border-amber-200";
      case "birdie": return "bg-blue-500/10 text-blue-600 border-blue-200";
      case "par": return "bg-green-500/10 text-green-600 border-green-200";
      default: return "bg-muted text-muted-foreground";
    }
  };

  const visibleColumns = columns.filter(c => c.visible);

  if (authLoading) {
    return (
      <AdminLayout>
        <div className="p-6 space-y-6">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-[600px]" />
        </div>
      </AdminLayout>
    );
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <AdminLayout>
      <div className="p-4 lg:p-6 space-y-4">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl lg:text-3xl uppercase tracking-wide text-foreground">
              Customers
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              {customers.length} total customers
            </p>
          </div>

          {/* Bulk Actions */}
          {selectedCustomers.size > 0 && (
            <div className="flex items-center gap-2 bg-primary/5 px-4 py-2 rounded-lg">
              <span className="text-sm font-medium">
                {selectedCustomers.size} selected
              </span>
              <Button variant="outline" size="sm">
                <Mail className="h-4 w-4 mr-1" />
                Email
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setSelectedCustomers(new Set())}>
                Clear
              </Button>
            </div>
          )}
        </div>

        {/* Filters and Search */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search customers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Tier Filter */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Filter className="h-4 w-4 mr-2" />
                {tierFilter || "All Tiers"}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => setTierFilter(null)}>
                All Tiers
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setTierFilter("albatross")}>
                Albatross
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTierFilter("eagle")}>
                Eagle
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTierFilter("birdie")}>
                Birdie
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTierFilter("par")}>
                Par
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTierFilter("visitor")}>
                Visitor
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Column Visibility */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Columns className="h-4 w-4 mr-2" />
                Columns
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {columns.map((col) => (
                <DropdownMenuCheckboxItem
                  key={col.key}
                  checked={col.visible}
                  onCheckedChange={() => toggleColumn(col.key)}
                >
                  {col.label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Export */}
          <Button variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>

        {/* Table */}
        <div className="border rounded-lg overflow-hidden">
          {isLoading ? (
            <div className="p-6">
              <Skeleton className="h-[400px]" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="w-12">
                    <Checkbox
                      checked={selectedCustomers.size === filteredCustomers.length && filteredCustomers.length > 0}
                      onCheckedChange={toggleAllSelection}
                    />
                  </TableHead>
                  {visibleColumns.map((col) => (
                    <TableHead key={col.key}>{col.label}</TableHead>
                  ))}
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCustomers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={visibleColumns.length + 2} className="text-center py-8 text-muted-foreground">
                      No customers found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredCustomers.map((customer) => (
                    <TableRow 
                      key={customer.id}
                      className={`hover:bg-muted/50 cursor-pointer ${
                        customer.user_id === highlightedUserId ? "bg-primary/5" : ""
                      }`}
                      onClick={() => setSelectedCustomer(customer)}
                    >
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedCustomers.has(customer.id)}
                          onCheckedChange={() => toggleCustomerSelection(customer.id)}
                        />
                      </TableCell>
                      {visibleColumns.map((col) => (
                        <TableCell key={col.key}>
                          {col.key === "membership_tier" ? (
                            <Badge className={getMembershipColor(customer.membership_tier)}>
                              {customer.membership_tier || "Visitor"}
                            </Badge>
                          ) : col.key === "created_at" ? (
                            format(new Date(customer.created_at), "MMM d, yyyy")
                          ) : col.key === "phone" ? (
                            customer.phone || "-"
                          ) : (
                            customer[col.key as keyof Customer]
                          )}
                        </TableCell>
                      ))}
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setSelectedCustomer(customer)}>
                              View Profile
                            </DropdownMenuItem>
                            <DropdownMenuItem>Edit Customer</DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem>
                              <Mail className="h-4 w-4 mr-2" />
                              Send Email
                            </DropdownMenuItem>
                            {customer.phone && (
                              <DropdownMenuItem>
                                <Phone className="h-4 w-4 mr-2" />
                                Call
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </div>

        {/* Customer Details Dialog */}
        <Dialog open={!!selectedCustomer} onOpenChange={() => setSelectedCustomer(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="font-display text-xl uppercase tracking-wide">
                Customer Profile
              </DialogTitle>
            </DialogHeader>
            
            {selectedCustomer && (
              <div className="space-y-4">
                {/* Header */}
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
                    <User className="h-7 w-7 text-primary" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-medium text-lg">
                      {selectedCustomer.first_name} {selectedCustomer.last_name}
                    </h3>
                    <Badge className={getMembershipColor(selectedCustomer.membership_tier)}>
                      {selectedCustomer.membership_tier || "Visitor"}
                    </Badge>
                  </div>
                </div>

                <hr className="border-border" />

                {/* Contact Info */}
                <div className="space-y-3">
                  <div className="flex items-center gap-3 text-sm">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <a href={`mailto:${selectedCustomer.email}`} className="hover:text-primary">
                      {selectedCustomer.email}
                    </a>
                  </div>
                  
                  {selectedCustomer.phone && (
                    <div className="flex items-center gap-3 text-sm">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      <a href={`tel:${selectedCustomer.phone}`} className="hover:text-primary">
                        {selectedCustomer.phone}
                      </a>
                    </div>
                  )}

                  <div className="flex items-center gap-3 text-sm">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">
                      Joined {format(new Date(selectedCustomer.created_at), "MMMM d, yyyy")}
                    </span>
                  </div>
                </div>

                <hr className="border-border" />

                {/* Actions */}
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1">
                    <Mail className="h-4 w-4 mr-2" />
                    Email
                  </Button>
                  <Button className="flex-1 bg-primary hover:bg-primary/90">
                    Edit Profile
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
