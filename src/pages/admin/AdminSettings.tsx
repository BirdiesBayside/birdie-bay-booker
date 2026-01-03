import { useState, useEffect } from "react";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Pencil, Trash2, Settings, ShoppingCart, Bell, DollarSign, X, Copy, Check, Eye } from "lucide-react";

// Template types and their available placeholder tags
const TEMPLATE_TAGS: Record<string, { tag: string; description: string }[]> = {
  booking_confirmation: [
    { tag: "{first_name}", description: "Customer's first name" },
    { tag: "{last_name}", description: "Customer's last name" },
    { tag: "{email}", description: "Customer's email address" },
    { tag: "{booking_date}", description: "Date of the booking (e.g. Monday, 15 January 2025)" },
    { tag: "{booking_time}", description: "Start time of the booking (e.g. 2:00 PM)" },
    { tag: "{end_time}", description: "End time of the booking (e.g. 4:00 PM)" },
    { tag: "{duration}", description: "Booking duration in hours (e.g. 2)" },
    { tag: "{bay_number}", description: "Bay number (e.g. 3)" },
    { tag: "{bay_name}", description: "Bay name (e.g. Bay 3)" },
    { tag: "{player_count}", description: "Number of players" },
    { tag: "{total_price}", description: "Total booking price (e.g. $60.00)" },
    { tag: "{door_code}", description: "Door access code (7675#)" },
  ],
  booking_cancellation: [
    { tag: "{first_name}", description: "Customer's first name" },
    { tag: "{last_name}", description: "Customer's last name" },
    { tag: "{email}", description: "Customer's email address" },
    { tag: "{booking_date}", description: "Date of the cancelled booking" },
    { tag: "{booking_time}", description: "Start time of the cancelled booking" },
    { tag: "{bay_number}", description: "Bay number" },
    { tag: "{bay_name}", description: "Bay name" },
    { tag: "{refund_amount}", description: "Refund amount if applicable" },
  ],
  credit_added: [
    { tag: "{first_name}", description: "Customer's first name" },
    { tag: "{last_name}", description: "Customer's last name" },
    { tag: "{email}", description: "Customer's email address" },
    { tag: "{deposit_amount}", description: "Amount of credit added (e.g. $50.00)" },
    { tag: "{new_balance}", description: "New total credit balance (e.g. $75.00)" },
    { tag: "{previous_balance}", description: "Previous credit balance (e.g. $25.00)" },
  ],
  welcome: [
    { tag: "{first_name}", description: "Customer's first name" },
    { tag: "{last_name}", description: "Customer's last name" },
    { tag: "{email}", description: "Customer's email address" },
  ],
  membership_activated: [
    { tag: "{first_name}", description: "Customer's first name" },
    { tag: "{last_name}", description: "Customer's last name" },
    { tag: "{email}", description: "Customer's email address" },
    { tag: "{tier_name}", description: "Membership tier name (e.g. Birdie)" },
    { tag: "{weekly_price}", description: "Weekly subscription price (e.g. $20.00)" },
  ],
  membership_cancelled: [
    { tag: "{first_name}", description: "Customer's first name" },
    { tag: "{last_name}", description: "Customer's last name" },
    { tag: "{email}", description: "Customer's email address" },
    { tag: "{tier_name}", description: "Previous membership tier name" },
  ],
  payment_failed: [
    { tag: "{first_name}", description: "Customer's first name" },
    { tag: "{last_name}", description: "Customer's last name" },
    { tag: "{email}", description: "Customer's email address" },
    { tag: "{tier_name}", description: "Previous membership tier name" },
  ],
};

interface EmailTemplateDB {
  id: string;
  template_key: string;
  name: string;
  description: string | null;
  subject: string | null;
  html_content: string | null;
  is_active: boolean;
}

interface EmailTemplate {
  id: string;
  name: string;
  description: string;
  templateKey: string;
}

interface POSProduct {
  id: string;
  name: string;
  price: number;
  family: string | null;
  is_active: boolean;
}

interface CustomerProfile {
  id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  email: string;
  membership_tier: string;
  custom_hourly_rate: number | null;
}


export default function AdminSettings() {
  const { isAdmin, isLoading: authLoading } = useAdminAuth();
  const { toast } = useToast();

  // General settings - load from localStorage
  const [timezone, setTimezone] = useState(() => {
    return localStorage.getItem('birdies_timezone') || "Australia/Sydney";
  });

  // Autosave timezone when it changes
  const handleTimezoneChange = (value: string) => {
    setTimezone(value);
    localStorage.setItem('birdies_timezone', value);
    toast({
      title: "Settings saved",
      description: `Timezone updated to ${value}`,
      duration: 3000,
    });
  };

  // POS Products
  const [products, setProducts] = useState<POSProduct[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(true);
  const [showProductDialog, setShowProductDialog] = useState(false);
  const [editingProduct, setEditingProduct] = useState<POSProduct | null>(null);
  const [productName, setProductName] = useState("");
  const [productPrice, setProductPrice] = useState("");
  const [productFamily, setProductFamily] = useState("");
  const [isSavingProduct, setIsSavingProduct] = useState(false);

  // Dynamic Pricing
  const [customers, setCustomers] = useState<CustomerProfile[]>([]);
  const [customersWithPricing, setCustomersWithPricing] = useState<CustomerProfile[]>([]);
  const [isLoadingCustomers, setIsLoadingCustomers] = useState(true);
  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedPricingCustomer, setSelectedPricingCustomer] = useState<CustomerProfile | null>(null);
  const [newCustomRate, setNewCustomRate] = useState("");
  const [isSavingRate, setIsSavingRate] = useState(false);


  // Get unique families from products
  const families = [...new Set(products.map(p => p.family).filter(Boolean))] as string[];

  // Email Templates
  const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplate | null>(null);
  const [emailTemplates, setEmailTemplates] = useState<EmailTemplateDB[]>([]);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(true);
  const [templateHtml, setTemplateHtml] = useState("");
  const [templateSubject, setTemplateSubject] = useState("");
  const [copiedTag, setCopiedTag] = useState<string | null>(null);
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewHtml, setPreviewHtml] = useState("");

  const copyTag = (tag: string) => {
    navigator.clipboard.writeText(tag);
    setCopiedTag(tag);
    setTimeout(() => setCopiedTag(null), 2000);
  };

  const fetchEmailTemplates = async () => {
    setIsLoadingTemplates(true);
    const { data, error } = await supabase
      .from("email_templates")
      .select("*")
      .order("name");
    
    if (!error && data) {
      setEmailTemplates(data);
    }
    setIsLoadingTemplates(false);
  };

  const openTemplateEditor = (template: EmailTemplateDB) => {
    setSelectedTemplate({
      id: template.id,
      name: template.name,
      description: template.description || "",
      templateKey: template.template_key,
    });
    setTemplateHtml(template.html_content || "");
    setTemplateSubject(template.subject || "");
  };

  const toggleTemplateActive = async (template: EmailTemplateDB) => {
    try {
      const { error } = await supabase
        .from("email_templates")
        .update({ is_active: !template.is_active })
        .eq("id", template.id);

      if (error) throw error;

      toast({
        title: template.is_active ? "Template disabled" : "Template enabled",
        description: `${template.name} email notifications are now ${template.is_active ? "off" : "on"}.`,
        duration: 3000,
      });

      fetchEmailTemplates();
    } catch (error: any) {
      toast({
        title: "Error updating template",
        description: error.message || "Failed to update template status.",
        variant: "destructive",
        duration: 4000,
      });
    }
  };

  const saveTemplate = async () => {
    if (!selectedTemplate) return;
    
    setIsSavingTemplate(true);
    try {
      const { error } = await supabase
        .from("email_templates")
        .update({
          html_content: templateHtml || null,
          subject: templateSubject || null,
        })
        .eq("template_key", selectedTemplate.templateKey);

      if (error) throw error;

      toast({
        title: "Template saved",
        description: `${selectedTemplate.name} template has been updated.`,
        duration: 4000,
      });

      setSelectedTemplate(null);
      fetchEmailTemplates();
    } catch (error: any) {
      toast({
        title: "Error saving template",
        description: error.message || "Failed to save template.",
        variant: "destructive",
        duration: 4000,
      });
    }
    setIsSavingTemplate(false);
  };

  useEffect(() => {
    if (isAdmin) {
      fetchProducts();
      fetchCustomers();
      fetchEmailTemplates();
    }
  }, [isAdmin]);


  const fetchProducts = async () => {
    setIsLoadingProducts(true);
    const { data, error } = await supabase
      .from("pos_products")
      .select("*")
      .order("family", { ascending: true })
      .order("name", { ascending: true });

    if (!error && data) {
      setProducts(data);
    }
    setIsLoadingProducts(false);
  };

  const fetchCustomers = async () => {
    setIsLoadingCustomers(true);
    const { data, error } = await supabase
      .from("profiles")
      .select("id, user_id, first_name, last_name, email, membership_tier, custom_hourly_rate")
      .order("last_name");

    if (!error && data) {
      setCustomers(data);
      setCustomersWithPricing(data.filter((c: CustomerProfile) => c.custom_hourly_rate !== null));
    }
    setIsLoadingCustomers(false);
  };

  const saveCustomRate = async () => {
    if (!selectedPricingCustomer) return;

    setIsSavingRate(true);
    try {
      const rate = newCustomRate ? parseFloat(newCustomRate) : null;
      
      const { error } = await supabase
        .from("profiles")
        .update({ custom_hourly_rate: rate })
        .eq("id", selectedPricingCustomer.id);

      if (error) throw error;

      toast({
        title: rate ? "Custom rate set" : "Custom rate removed",
        description: rate 
          ? `${selectedPricingCustomer.first_name} ${selectedPricingCustomer.last_name} now has a custom rate of $${rate}/hr.`
          : `${selectedPricingCustomer.first_name} ${selectedPricingCustomer.last_name} will use their tier rate.`,
        duration: 4000,
      });

      setSelectedPricingCustomer(null);
      setNewCustomRate("");
      fetchCustomers();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to save custom rate.",
        variant: "destructive",
        duration: 4000,
      });
    }
    setIsSavingRate(false);
  };

  const removeCustomRate = async (customer: CustomerProfile) => {
    const { error } = await supabase
      .from("profiles")
      .update({ custom_hourly_rate: null })
      .eq("id", customer.id);

    if (!error) {
      toast({
        title: "Custom rate removed",
        description: `${customer.first_name} ${customer.last_name} will use their tier rate.`,
        duration: 4000,
      });
      fetchCustomers();
    }
  };

  const filteredCustomers = customers.filter(c => {
    if (!customerSearch) return true;
    const search = customerSearch.toLowerCase();
    return (
      c.first_name?.toLowerCase().includes(search) ||
      c.last_name?.toLowerCase().includes(search) ||
      c.email?.toLowerCase().includes(search)
    );
  });

  const openProductDialog = (product?: POSProduct) => {
    if (product) {
      setEditingProduct(product);
      setProductName(product.name);
      setProductPrice(product.price.toString());
      setProductFamily(product.family || "");
    } else {
      setEditingProduct(null);
      setProductName("");
      setProductPrice("");
      setProductFamily("");
    }
    setShowProductDialog(true);
  };

  const saveProduct = async () => {
    if (!productName || !productPrice) {
      toast({
        title: "Missing information",
        description: "Please enter product name and price.",
        variant: "destructive",
        duration: 4000,
      });
      return;
    }

    setIsSavingProduct(true);

    try {
      const productData = {
        name: productName,
        price: parseFloat(productPrice),
        family: productFamily || null,
      };

      if (editingProduct) {
        const { error } = await supabase
          .from("pos_products")
          .update(productData)
          .eq("id", editingProduct.id);

        if (error) throw error;
        toast({ title: "Product updated", duration: 4000 });
      } else {
        const { error } = await supabase
          .from("pos_products")
          .insert(productData);

        if (error) throw error;
        toast({ title: "Product created", duration: 4000 });
      }

      setShowProductDialog(false);
      fetchProducts();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to save product.",
        variant: "destructive",
        duration: 4000,
      });
    }

    setIsSavingProduct(false);
  };

  const toggleProductActive = async (product: POSProduct) => {
    const { error } = await supabase
      .from("pos_products")
      .update({ is_active: !product.is_active })
      .eq("id", product.id);

    if (!error) {
      toast({
        title: product.is_active ? "Product disabled" : "Product enabled",
        duration: 4000,
      });
      fetchProducts();
    }
  };

  const deleteProduct = async (product: POSProduct) => {
    if (!confirm(`Delete "${product.name}"?`)) return;

    const { error } = await supabase
      .from("pos_products")
      .delete()
      .eq("id", product.id);

    if (!error) {
      toast({ title: "Product deleted", duration: 4000 });
      fetchProducts();
    }
  };

  if (authLoading) {
    return (
      <AdminLayout>
        <div className="p-6 space-y-6">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-[400px]" />
        </div>
      </AdminLayout>
    );
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <AdminLayout>
      <div className="p-4 lg:p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-2xl lg:text-3xl uppercase tracking-wide text-foreground">
              Settings
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Manage platform configuration
            </p>
          </div>
        </div>

        <Tabs defaultValue="general" className="space-y-6">
          <TabsList className="grid w-full max-w-lg grid-cols-4">
            <TabsTrigger value="general" className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              General
            </TabsTrigger>
            <TabsTrigger value="pricing" className="flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Pricing
            </TabsTrigger>
            <TabsTrigger value="pos" className="flex items-center gap-2">
              <ShoppingCart className="h-4 w-4" />
              POS
            </TabsTrigger>
            <TabsTrigger value="notifications" className="flex items-center gap-2">
              <Bell className="h-4 w-4" />
              Notifications
            </TabsTrigger>
          </TabsList>

          {/* General Settings */}
          <TabsContent value="general" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>General Settings</CardTitle>
                <CardDescription>Configure basic platform settings</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="max-w-sm space-y-2">
                  <Label htmlFor="timezone">Timezone</Label>
                  <Select value={timezone} onValueChange={handleTimezoneChange}>
                    <SelectTrigger id="timezone">
                      <SelectValue placeholder="Select timezone" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Australia/Sydney">Australia/Sydney (AEST)</SelectItem>
                      <SelectItem value="Australia/Melbourne">Australia/Melbourne (AEST)</SelectItem>
                      <SelectItem value="Australia/Brisbane">Australia/Brisbane (AEST)</SelectItem>
                      <SelectItem value="Australia/Perth">Australia/Perth (AWST)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Timezone used for booking times and notifications
                  </p>
                </div>

                <div className="max-w-sm space-y-2">
                  <Label>Operating Hours</Label>
                  <p className="text-sm text-muted-foreground">
                    5:00 AM - 11:00 PM daily
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Contact support to modify operating hours
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Pricing Settings */}
          <TabsContent value="pricing" className="space-y-4">

            {/* Dynamic Pricing (Customer Overrides) */}
            <Card>
              <CardHeader>
                <CardTitle>Customer Overrides</CardTitle>
                <CardDescription>Set custom hourly rates for specific customers (overrides tier pricing)</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Customers with custom pricing */}
                {customersWithPricing.length > 0 && (
                  <div className="space-y-2">
                    <Label>Customers with Custom Rates</Label>
                    <div className="space-y-2">
                      {customersWithPricing.map((customer) => (
                        <div key={customer.id} className="flex items-center justify-between p-3 border rounded-lg">
                          <div>
                            <span className="font-medium">{customer.first_name} {customer.last_name}</span>
                            <Badge className="ml-2 text-xs" variant="secondary">{customer.membership_tier}</Badge>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-primary">${customer.custom_hourly_rate}/hr</span>
                            <Button variant="ghost" size="icon" onClick={() => removeCustomRate(customer)}>
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Add custom pricing */}
                <div className="space-y-2">
                  <Label>Set Custom Rate for Customer</Label>
                  <Input
                    placeholder="Search customers..."
                    value={customerSearch}
                    onChange={(e) => setCustomerSearch(e.target.value)}
                  />
                  {customerSearch && (
                    <div className="max-h-40 overflow-y-auto border rounded-md">
                      {filteredCustomers.slice(0, 10).map((customer) => (
                        <button
                          key={customer.id}
                          onClick={() => {
                            setSelectedPricingCustomer(customer);
                            setNewCustomRate(customer.custom_hourly_rate?.toString() || "");
                            setCustomerSearch("");
                          }}
                          className="w-full p-2 text-left text-sm hover:bg-muted/50 flex items-center justify-between border-b last:border-b-0"
                        >
                          <span>{customer.first_name} {customer.last_name}</span>
                          <Badge variant="outline" className="text-xs">{customer.membership_tier}</Badge>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {selectedPricingCustomer && (
                  <div className="p-4 border rounded-lg bg-muted/30 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{selectedPricingCustomer.first_name} {selectedPricingCustomer.last_name}</span>
                      <Button variant="ghost" size="sm" onClick={() => setSelectedPricingCustomer(null)}>Cancel</Button>
                    </div>
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="Custom hourly rate"
                        value={newCustomRate}
                        onChange={(e) => setNewCustomRate(e.target.value)}
                        className="flex-1"
                      />
                      <Button onClick={saveCustomRate} disabled={isSavingRate}>
                        {isSavingRate ? "Saving..." : "Save Rate"}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">Leave empty to remove custom rate and use tier pricing</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* POS Settings */}
          <TabsContent value="pos" className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>POS Products</CardTitle>
                  <CardDescription>Manage products available in the POS system</CardDescription>
                </div>
                <Button onClick={() => openProductDialog()} size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Product
                </Button>
              </CardHeader>
              <CardContent>
                {isLoadingProducts ? (
                  <Skeleton className="h-48" />
                ) : products.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <ShoppingCart className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>No products yet</p>
                    <Button variant="outline" size="sm" className="mt-2" onClick={() => openProductDialog()}>
                      Add your first product
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {families.length > 0 && families.map((family) => (
                      <div key={family}>
                        <h4 className="font-medium text-sm text-muted-foreground mb-2 uppercase tracking-wide">
                          {family}
                        </h4>
                        <div className="grid gap-2">
                          {products
                            .filter((p) => p.family === family)
                            .map((product) => (
                              <ProductRow
                                key={product.id}
                                product={product}
                                onEdit={() => openProductDialog(product)}
                                onToggle={() => toggleProductActive(product)}
                                onDelete={() => deleteProduct(product)}
                              />
                            ))}
                        </div>
                      </div>
                    ))}
                    {products.filter((p) => !p.family).length > 0 && (
                      <div>
                        <h4 className="font-medium text-sm text-muted-foreground mb-2 uppercase tracking-wide">
                          Other
                        </h4>
                        <div className="grid gap-2">
                          {products
                            .filter((p) => !p.family)
                            .map((product) => (
                              <ProductRow
                                key={product.id}
                                product={product}
                                onEdit={() => openProductDialog(product)}
                                onToggle={() => toggleProductActive(product)}
                                onDelete={() => deleteProduct(product)}
                              />
                            ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Notifications Settings */}
          <TabsContent value="notifications" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Email Templates</CardTitle>
                <CardDescription>Customize email notification templates</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {isLoadingTemplates ? (
                  <Skeleton className="h-32" />
                ) : emailTemplates.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No templates found.</p>
                ) : (
                  emailTemplates.map((template) => (
                    <div
                      key={template.id}
                      className={`w-full border rounded-lg p-4 transition-colors ${template.is_active ? 'hover:bg-muted/50' : 'opacity-60 bg-muted/20'}`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <h4 className="font-medium">{template.name}</h4>
                            {!template.is_active && (
                              <Badge variant="outline" className="text-muted-foreground">Disabled</Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">{template.description}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          {template.html_content ? (
                            <Badge variant="default" className="bg-green-600">Custom</Badge>
                          ) : (
                            <Badge variant="secondary">Default</Badge>
                          )}
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                setPreviewHtml(template.html_content || "<p>No custom template set. Using default template.</p>");
                                setPreviewOpen(true);
                              }}
                              disabled={!template.html_content}
                              className="h-8 w-8"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openTemplateEditor(template)}
                              className="h-8 w-8"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </div>
                          <Button
                            variant={template.is_active ? "default" : "outline"}
                            size="sm"
                            onClick={() => toggleTemplateActive(template)}
                            className={template.is_active ? "bg-green-600 hover:bg-green-700" : ""}
                          >
                            {template.is_active ? "On" : "Off"}
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>SMS Settings</CardTitle>
                <CardDescription>Configure SMS notification settings</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="max-w-sm space-y-2">
                  <Label>Sender Name (Alpha Tag)</Label>
                  <Input value="Birdies" disabled />
                  <p className="text-xs text-muted-foreground">
                    Registered sender name for SMS messages
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Email Template Editor Dialog */}
        <Dialog open={!!selectedTemplate} onOpenChange={(open) => !open && setSelectedTemplate(null)}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="font-display text-xl uppercase tracking-wide">
                {selectedTemplate?.name}
              </DialogTitle>
              <DialogDescription>
                {selectedTemplate?.description}
              </DialogDescription>
            </DialogHeader>
            
            {selectedTemplate && (
              <div className="space-y-4">
                {/* Available Tags Section */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Available Tags</Label>
                  <p className="text-xs text-muted-foreground mb-2">
                    Click a tag to copy it, then paste into your template HTML
                  </p>
                  <div className="flex flex-wrap gap-2 p-3 bg-muted/30 rounded-lg border">
                    {TEMPLATE_TAGS[selectedTemplate.templateKey]?.map((item) => (
                      <button
                        key={item.tag}
                        onClick={() => copyTag(item.tag)}
                        className="inline-flex items-center gap-1 px-2 py-1 bg-background border rounded text-xs font-mono hover:bg-primary/10 hover:border-primary transition-colors group"
                        title={item.description}
                      >
                        {item.tag}
                        {copiedTag === item.tag ? (
                          <Check className="h-3 w-3 text-green-500" />
                        ) : (
                          <Copy className="h-3 w-3 text-muted-foreground group-hover:text-primary" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Tag Descriptions */}
                <div className="space-y-1">
                  <Label className="text-sm font-medium">Tag Reference</Label>
                  <div className="text-xs text-muted-foreground space-y-1 p-3 bg-muted/20 rounded-lg border max-h-32 overflow-y-auto">
                    {TEMPLATE_TAGS[selectedTemplate.templateKey]?.map((item) => (
                      <div key={item.tag} className="flex gap-2">
                        <code className="font-mono text-primary">{item.tag}</code>
                        <span>— {item.description}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Subject Line */}
                <div className="space-y-2">
                  <Label>Email Subject</Label>
                  <Input
                    value={templateSubject}
                    onChange={(e) => setTemplateSubject(e.target.value)}
                    placeholder="e.g. Your Birdies Booking Confirmation"
                  />
                </div>

                {/* HTML Editor */}
                <div className="space-y-2">
                  <Label>Template HTML</Label>
                  <Textarea
                    value={templateHtml}
                    onChange={(e) => setTemplateHtml(e.target.value)}
                    placeholder={`<h1>Hi {first_name}!</h1>\n<p>Your booking has been confirmed...</p>`}
                    className="font-mono text-sm min-h-[200px]"
                  />
                  <p className="text-xs text-muted-foreground">
                    Paste your custom HTML email template here. Use the tags above to personalize the message. Leave empty to use the default template.
                  </p>
                </div>

                <div className="flex gap-2 justify-end">
                  <Button variant="outline" onClick={() => setSelectedTemplate(null)}>
                    Cancel
                  </Button>
                  <Button onClick={saveTemplate} disabled={isSavingTemplate}>
                    {isSavingTemplate ? "Saving..." : "Save Template"}
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Email Template Preview Dialog */}
        <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh]">
            <DialogHeader>
              <DialogTitle>Email Preview</DialogTitle>
            </DialogHeader>
            <div className="border rounded-lg overflow-hidden bg-white">
              <iframe
                srcDoc={previewHtml}
                className="w-full h-[500px] border-0"
                title="Email Preview"
              />
            </div>
          </DialogContent>
        </Dialog>

        {/* Product Dialog */}
        <Dialog open={showProductDialog} onOpenChange={setShowProductDialog}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="font-display text-xl uppercase tracking-wide">
                {editingProduct ? "Edit Product" : "Add Product"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Product Name *</Label>
                <Input
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                  placeholder="e.g. Beer"
                />
              </div>
              <div className="space-y-2">
                <Label>Price ($) *</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={productPrice}
                  onChange={(e) => setProductPrice(e.target.value)}
                  placeholder="e.g. 8.00"
                />
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Input
                  value={productFamily}
                  onChange={(e) => setProductFamily(e.target.value)}
                  placeholder="e.g. Drinks"
                  list="families"
                />
                <datalist id="families">
                  {families.map((f) => (
                    <option key={f} value={f} />
                  ))}
                </datalist>
              </div>
              <Button
                className="w-full"
                onClick={saveProduct}
                disabled={isSavingProduct}
              >
                {isSavingProduct ? "Saving..." : editingProduct ? "Update Product" : "Add Product"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}

function ProductRow({
  product,
  onEdit,
  onToggle,
  onDelete,
}: {
  product: POSProduct;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  return (
    <div className={`flex items-center justify-between p-3 border rounded-lg ${!product.is_active ? "opacity-50" : ""}`}>
      <div>
        <span className="font-medium">{product.name}</span>
        <span className="text-muted-foreground ml-2">${product.price.toFixed(2)}</span>
      </div>
      <div className="flex items-center gap-2">
        {!product.is_active && (
          <Badge variant="secondary" className="text-xs">Disabled</Badge>
        )}
        <Button variant="ghost" size="icon" onClick={onEdit}>
          <Pencil className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={onToggle}>
          {product.is_active ? "⏸" : "▶"}
        </Button>
        <Button variant="ghost" size="icon" onClick={onDelete} className="text-destructive">
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
