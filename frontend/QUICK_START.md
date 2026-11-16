# 🚀 Quick Start Guide - TCTESDAConnect Redesign

## Madaling Steps Para Ma-test Agad!

### Step 1: Test the New Layout (5 minutes)

```bash
# Go to frontend folder
cd c:\Users\delar\Downloads\tesda-connect\tesda-connect\frontend

# Install dependencies (kung may changes)
npm install

# Run development server
npm run dev
```

**Open:** http://localhost:5173

### Step 2: Check Kung Gumana ang Fixed Layout

1. ✅ Login with any user role
2. ✅ Scroll ang main content → **Sidebar SHOULD NOT move!**
3. ✅ Click mobile menu (kung mobile) → **Drawer should open smoothly**
4. ✅ Click collapse button (desktop) → **Sidebar should shrink to icons only**

Kung **WORKING** yan - SUCCESS! ✅

---

## Step 3: Apply DataTable to ONE Page (Example: Trainee Records)

### Option A: Simple Example (Copy-Paste Ready)

Create this file: `src/features/records/TraineeRecordsPageNew.tsx`

```typescript
import { DataTable } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Plus, Eye, Edit, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

// Mock data for testing (replace with real data later)
const mockTrainees = [
  {
    id: '1',
    scholarId: 'TC-2026-001',
    name: 'Juan Dela Cruz',
    email: 'juan@example.com',
    program: 'Organic Agriculture Production',
    batch: 'Batch 2026-A',
    status: 'active',
  },
  {
    id: '2',
    scholarId: 'TC-2026-002',
    name: 'Maria Santos',
    email: 'maria@example.com',
    program: 'Food Processing',
    batch: 'Batch 2026-A',
    status: 'active',
  },
  // Add more mock data...
];

export function TraineeRecordsPageNew() {
  const navigate = useNavigate();

  const handleDelete = (trainee: typeof mockTrainees[0]) => {
    if (confirm(`Delete ${trainee.name}?`)) {
      console.log('Deleting:', trainee);
      // Add your delete logic here
    }
  };

  return (
    <div className="space-y-4">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Trainee Records</h1>
          <p className="text-sm text-slate-600">Manage confirmed trainee records</p>
        </div>
        <Button onClick={() => navigate('/intake')}>
          <Plus className="mr-2 h-4 w-4" />
          New Trainee
        </Button>
      </div>

      {/* Data Table */}
      <DataTable
        data={mockTrainees}
        columns={[
          {
            key: 'scholarId',
            label: 'Scholar ID',
            sortable: true,
          },
          {
            key: 'name',
            label: 'Name',
            sortable: true,
            render: (item) => (
              <div>
                <p className="font-medium text-slate-900">{item.name}</p>
                <p className="text-xs text-slate-500">{item.email}</p>
              </div>
            ),
          },
          {
            key: 'program',
            label: 'Program',
            sortable: true,
          },
          {
            key: 'batch',
            label: 'Batch',
          },
          {
            key: 'status',
            label: 'Status',
            render: (item) => (
              <Badge
                variant={
                  item.status === 'active'
                    ? 'success'
                    : item.status === 'completed'
                      ? 'default'
                      : 'warning'
                }
              >
                {item.status}
              </Badge>
            ),
          },
        ]}
        actions={[
          {
            label: 'View Details',
            icon: <Eye className="h-4 w-4" />,
            onClick: (item) => navigate(`/trainees/${item.id}`),
          },
          {
            label: 'Edit',
            icon: <Edit className="h-4 w-4" />,
            onClick: (item) => navigate(`/trainees/${item.id}/edit`),
          },
          {
            label: 'Delete',
            icon: <Trash2 className="h-4 w-4" />,
            onClick: handleDelete,
            variant: 'destructive',
          },
        ]}
        keyExtractor={(item) => item.id}
        searchable
        searchPlaceholder="Search trainees..."
        searchKeys={['name', 'scholarId', 'email', 'program']}
        enablePagination
        initialPageSize={10}
      />
    </div>
  );
}
```

### Test It:

1. Temporarily update your routing to use this new page
2. Check if table displays correctly
3. Test search, sort, pagination
4. Test actions dropdown

Kung **WORKING** - apply the same pattern to other pages! ✅

---

## Step 4: Replace Real Data (After Testing)

```typescript
// Instead of mockTrainees, use real data:

import { useQuery } from '@tanstack/react-query';

export function TraineeRecordsPageNew() {
  // Fetch real data
  const { data: trainees = [], isLoading } = useQuery({
    queryKey: ['trainees'],
    queryFn: async () => {
      // Your existing fetch logic here
      const response = await supabase
        .from('enrollment_applications')
        .select('*')
        .eq('status', 'confirmed');
      return response.data || [];
    },
  });

  return (
    <div className="space-y-4">
      {/* Same header as before */}
      
      <DataTable
        data={trainees}
        columns={/* same columns */}
        actions={/* same actions */}
        keyExtractor={(item) => item.id}
        searchable
        searchKeys={['learner_name', 'scholar_id', 'email']}
        enablePagination
        loading={isLoading}  // Add this!
      />
    </div>
  );
}
```

---

## Common Issues & Quick Fixes

### Issue 1: "Module not found"

```bash
# Solution: Make sure you're in the right directory
cd c:\Users\delar\Downloads\tesda-connect\tesda-connect\frontend

# Check if files exist
ls src/components/ui/pagination.tsx
ls src/components/ui/data-table.tsx
ls src/components/ui/dropdown-menu.tsx
ls src/components/layout/AppLayoutFixed.tsx
```

### Issue 2: TypeScript errors

```bash
# Solution: Check types, rebuild
npm run typecheck
```

### Issue 3: Sidebar still scrolling with content

```typescript
// Make sure App.tsx imports the NEW layout:
import { AppLayoutFixed } from '@/components/layout/AppLayoutFixed';

// NOT the old one:
// import { AppLayout } from '@/components/layout/AppLayout';
```

### Issue 4: Badge variant not found

```typescript
// Check your badge.tsx has these variants:
// 'default' | 'success' | 'warning' | 'destructive' | 'info'

// If not, add them or use default:
<Badge>{item.status}</Badge>
```

---

## Checklist Before Moving to Next Page

- [ ] Layout is fixed (sidebar independent)
- [ ] DataTable shows data correctly
- [ ] Search filters records
- [ ] Sort works (ascending/descending)
- [ ] Pagination works (10/25/50 rows)
- [ ] Actions menu opens
- [ ] Actions work (View/Edit/Delete)
- [ ] Mobile responsive
- [ ] No TypeScript errors
- [ ] No console errors

Kung **LAHAT CHECK** - proceed to next page! ✅

---

## Priority Order (Which Pages to Do First)

### Do First (High Priority):
1. ✅ Trainee Records - Most used, high visibility
2. ✅ Enrollment Review - Critical workflow
3. ✅ Sync Queue - Offline functionality
4. ✅ Announcements - Communication

### Do Next (Medium Priority):
5. ✅ Training Batches - Scheduling
6. ✅ User Accounts - Admin panel
7. ✅ Courses & Materials - Resource management

### Do Last (Lower Priority):
8. ✅ Audit Logs - Less frequently accessed
9. ✅ Reports - Mostly read-only
10. ✅ Other pages

---

## Testing Shortcuts

### Quick Pagination Test:
1. Add 100+ records (or use mock data)
2. Check if pagination appears
3. Change page size to 10 → should show 10 records
4. Go to page 2 → should show next 10 records
5. Search something → should reset to page 1

### Quick Actions Test:
1. Click three-dot menu (•••)
2. Check if dropdown opens
3. Click "View" → should navigate
4. Click "Edit" → should open edit
5. Click "Delete" → should confirm & delete

### Quick Sort Test:
1. Click "Name" column header
2. Should sort A-Z (ascending)
3. Click again → should sort Z-A (descending)
4. Click third time → should remove sort

---

## Performance Tips

### For Large Datasets (1000+ records):

**Option 1: Client-Side (Offline Mode)**
```typescript
// Good for offline-first, keeps all data local
const { data = [] } = useQuery(['trainees']);
// DataTable handles filtering/pagination internally
```

**Option 2: Server-Side (Online Mode)**
```typescript
// Better for very large datasets
const [page, setPage] = useState(1);
const [pageSize, setPageSize] = useState(10);
const [search, setSearch] = useState('');

const { data } = useQuery(
  ['trainees', page, pageSize, search],
  () => fetchTraineesPage({ page, pageSize, search })
);

// Use custom Pagination component instead of DataTable's
```

---

## Next Steps After This Works

1. ✅ Apply to all list pages (priority order above)
2. ✅ Create compact dashboard cards (Phase 5)
3. ✅ Modernize registration form (Phase 6)
4. ✅ Create modal components (Phase 7)
5. ✅ Improve calendar interface (Phase 8)
6. ✅ Polish offline sync UI (Phase 9)
7. ✅ Final testing & documentation (Phase 10)

---

## Need Help?

Check these files:
- `REDESIGN_SUMMARY.md` - Overview (Tagalog/English)
- `REDESIGN_IMPLEMENTATION_GUIDE.md` - Detailed guide (English)
- Component source code - Has JSDoc comments

---

## 🎉 Success!

Kung natapos mo na at WORKING lahat:

✅ **CONGRATULATIONS!**  
✅ Modern, professional layout  
✅ Fixed scrolling issue  
✅ Universal pagination  
✅ Consistent UI across pages  
✅ Enterprise-grade system  

**Ready for thesis defense!** 🎓

---

**Quick Start Guide**  
**Last Updated:** January 2026  
**For:** Balli School of Technology & Mamburao Integrated Farm
