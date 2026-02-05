 import { useState } from "react";
 import { Check, ChevronsUpDown, User, X } from "lucide-react";
 import { cn } from "@/lib/utils";
 import { Button } from "@/components/ui/button";
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
 
 interface Customer {
   user_id: string;
   first_name: string;
   last_name: string;
   email: string;
   deposit_balance?: number;
 }
 
 interface CustomerSearchComboboxProps {
   customers: Customer[];
   value: string;
   onValueChange: (value: string) => void;
 }
 
 export function CustomerSearchCombobox({
   customers,
   value,
   onValueChange,
 }: CustomerSearchComboboxProps) {
   const [open, setOpen] = useState(false);
 
   const selectedCustomer = customers.find((c) => c.user_id === value);
 
   return (
     <div className="flex gap-2">
       <Popover open={open} onOpenChange={setOpen}>
         <PopoverTrigger asChild>
           <Button
             variant="outline"
             role="combobox"
             aria-expanded={open}
             className="w-full justify-between h-10"
           >
             {selectedCustomer ? (
               <span className="flex items-center gap-2 truncate">
                 <User className="h-4 w-4 shrink-0" />
                 {selectedCustomer.first_name} {selectedCustomer.last_name}
               </span>
             ) : (
               <span className="text-muted-foreground">Select customer (optional)</span>
             )}
             <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
           </Button>
         </PopoverTrigger>
         <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
           <Command>
             <CommandInput placeholder="Search customers..." />
             <CommandList>
               <CommandEmpty>No customer found.</CommandEmpty>
               <CommandGroup>
                 {customers.map((customer) => (
                   <CommandItem
                     key={customer.user_id}
                     value={`${customer.first_name} ${customer.last_name} ${customer.email}`}
                     onSelect={() => {
                       onValueChange(customer.user_id);
                       setOpen(false);
                     }}
                   >
                     <Check
                       className={cn(
                         "mr-2 h-4 w-4",
                         value === customer.user_id ? "opacity-100" : "opacity-0"
                       )}
                     />
                     <div className="flex flex-col">
                       <span>{customer.first_name} {customer.last_name}</span>
                       <span className="text-xs text-muted-foreground">{customer.email}</span>
                     </div>
                   </CommandItem>
                 ))}
               </CommandGroup>
             </CommandList>
           </Command>
         </PopoverContent>
       </Popover>
       {value && (
         <Button
           variant="ghost"
           size="icon"
           className="shrink-0"
           onClick={() => onValueChange("")}
         >
           <X className="h-4 w-4" />
         </Button>
       )}
     </div>
   );
 }