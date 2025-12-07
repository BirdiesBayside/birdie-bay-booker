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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, Settings, ShoppingCart, Bell } from "lucide-react";

interface POSProduct {
  id: string;
  name: string;
  price: number;
  family: string | null;
  is_active: boolean;
}

export default function AdminSettings() {
  const { isAdmin, isLoading: authLoading } = useAdminAuth();
  const { toast } = useToast();

  // General settings
  const [timezone, setTimezone] = useState("Australia/Sydney");

  // POS Products
  const [products, setProducts] = useState<POSProduct[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(true);
  const [showProductDialog, setShowProductDialog] = useState(false);
  const [editingProduct, setEditingProduct] = useState<POSProduct | null>(null);
  const [productName, setProductName] = useState("");
  const [productPrice, setProductPrice] = useState("");
  const [productFamily, setProductFamily] = useState("");
  const [isSavingProduct, setIsSavingProduct] = useState(false);

  // Get unique families from products
  const families = [...new Set(products.map(p => p.family).filter(Boolean))] as string[];

  useEffect(() => {
    if (isAdmin) {
      fetchProducts();
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
          <TabsList className="grid w-full max-w-md grid-cols-3">
            <TabsTrigger value="general" className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              General
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
                  <Select value={timezone} onValueChange={setTimezone}>
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
                <div className="border rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-medium">Booking Confirmation</h4>
                      <p className="text-sm text-muted-foreground">Sent when a booking is created</p>
                    </div>
                    <Badge variant="secondary">Default</Badge>
                  </div>
                </div>
                <div className="border rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-medium">Booking Cancellation</h4>
                      <p className="text-sm text-muted-foreground">Sent when a booking is cancelled</p>
                    </div>
                    <Badge variant="secondary">Default</Badge>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Template customization coming soon
                </p>
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
