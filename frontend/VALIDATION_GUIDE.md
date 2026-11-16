# ✅ Real-Time Form Validation Guide

## 🎯 What Was Created

Nag-implement ako ng **complete real-time validation system** with:

✅ **Instant field validation** - Red border + error message kapag may mali  
✅ **Toast notifications** - Alert popup for critical errors  
✅ **Required field warnings** - Shows kung ilang fields pa ang kailangan  
✅ **Auto-validation on blur** - Validates kapag umalis sa field  
✅ **Custom validation rules** - Age check, name format, etc.  
✅ **Accessible components** - Screen reader friendly  

---

## 📁 Files Created

### 1. **Validation Hook** (`useFormValidation.ts`)
- Core validation logic
- Real-time error checking
- Field state management

### 2. **Validated Input** (`validated-input.tsx`)
- Text input with validation
- Shows error messages
- Red border when invalid
- Error icon indicator

### 3. **Validated Select** (`validated-select.tsx`)
- Dropdown with validation
- Error states
- Required field indicator

### 4. **Validated Checkbox Group** (`validated-checkbox-group.tsx`)
- Checkbox group with validation
- Visual feedback for errors
- Selected count display

### 5. **Example Form** (`RegistrationFormWithValidation.tsx`)
- Complete working example
- All validation features demonstrated
- Ready to use/modify

---

## 🚀 How It Works

### BEFORE (Walang Validation):
```typescript
<input 
  type="text" 
  placeholder="First Name"
/>
```

### AFTER (With Validation):
```typescript
<ValidatedInput
  label="First Name"
  name="firstName"
  value={values.firstName}
  onChange={(e) => handleChange('firstName', e.target.value)}
  onBlur={() => handleBlur('firstName')}
  error={errors.firstName}
  touched={touched.firstName}
  required
  placeholder="Juan"
/>
```

**Result:**
- ✅ Shows red border kung may error
- ✅ Shows error message below field
- ✅ Shows red asterisk (*) kung required
- ✅ Validates on blur (umalis sa field)
- ✅ Validates on submit

---

## 💡 Features

### 1. **Instant Field Validation**

Kapag mag-type at umalis ka sa field:

```
┌────────────────────────┐
│ First Name *           │
├────────────────────────┤
│ [Juan123]             │ ← Red border
│ ⚠ Name cannot contain  │
│   numbers              │
└────────────────────────┘
```

---

### 2. **Toast Notifications**

Popup alerts for important messages:

```
┌─────────────────────────────────────┐
│ ⚠️ Form Incomplete                   │
│ Please complete 5 required field(s) │
└─────────────────────────────────────┘
```

---

### 3. **Section Warning Banner**

Shows kung ilang fields pa:

```
┌───────────────────────────────────────┐
│ ⚠️ 5 Required Fields Remaining        │
│ Please complete all required fields   │
│ marked with *                         │
└───────────────────────────────────────┘
```

---

### 4. **Real-Time Validation Rules**

```typescript
const VALIDATION_RULES = {
  firstName: {
    required: true,          // ← Required field
    minLength: 2,           // ← At least 2 characters
    maxLength: 50,          // ← Max 50 characters
    pattern: /^[a-zA-Z\s]+$/, // ← Letters only
    custom: (value) => {    // ← Custom check
      if (value && /\d/.test(value)) {
        return 'Name cannot contain numbers';
      }
      return null;
    }
  }
};
```

---

### 5. **Auto-Calculate Age**

Automatic computation when birth year is entered:

```typescript
const handleBirthYearChange = (value: string) => {
  handleChange('birthYear', value);
  
  if (value && !isNaN(parseInt(value))) {
    const age = new Date().getFullYear() - parseInt(value);
    handleChange('age', age.toString());
  }
};
```

**Example:**
```
Birth Year: [1990]  →  Age: [34] (auto-filled)
```

---

### 6. **Submit Button State**

Button text changes based on validation:

```
✅ All fields complete:
[Submit Application]

❌ Has incomplete fields:
[Complete 5 Required Field(s)]
```

---

## 🎨 Visual States

### Normal State:
```
┌────────────────────────┐
│ First Name *           │
├────────────────────────┤
│ [                ]     │ ← Gray border
└────────────────────────┘
```

### Focused State:
```
┌────────────────────────┐
│ First Name *           │
├────────────────────────┤
│ [Juan            ]     │ ← Blue border
└────────────────────────┘
```

### Error State:
```
┌────────────────────────┐
│ First Name *           │
├────────────────────────┤
│ [                ] ⚠️  │ ← Red border + icon
│ This field is required │ ← Error message
└────────────────────────┘
```

### Valid State:
```
┌────────────────────────┐
│ First Name *           │
├────────────────────────┤
│ [Juan Dela Cruz  ]     │ ← Green border (optional)
└────────────────────────┘
```

---

## 📝 Usage Examples

### Example 1: Simple Text Input

```typescript
<ValidatedInput
  label="First Name"
  name="firstName"
  value={values.firstName}
  onChange={(e) => handleChange('firstName', e.target.value)}
  onBlur={() => handleBlur('firstName')}
  error={errors.firstName}
  touched={touched.firstName}
  required
  placeholder="Enter your first name"
  helperText="Enter your legal first name"
/>
```

---

### Example 2: Select Dropdown

```typescript
<ValidatedSelect
  label="Province"
  name="province"
  value={values.province}
  onChange={(e) => handleChange('province', e.target.value)}
  onBlur={() => handleBlur('province')}
  error={errors.province}
  touched={touched.province}
  required
  placeholder="Select province"
  options={[
    { value: 'occidental-mindoro', label: 'Occidental Mindoro' },
    { value: 'oriental-mindoro', label: 'Oriental Mindoro' },
    // More options...
  ]}
/>
```

---

### Example 3: Checkbox Group

```typescript
<ValidatedCheckboxGroup
  label="Employment Status"
  name="employmentStatus"
  value={values.employmentStatus}
  onChange={(value) => handleChange('employmentStatus', value)}
  onBlur={() => handleBlur('employmentStatus')}
  error={errors.employmentStatus}
  touched={touched.employmentStatus}
  required
  columns={3}
  options={[
    { value: 'employed', label: 'Wage Employed' },
    { value: 'self_employed', label: 'Self-Employed' },
    { value: 'unemployed', label: 'Unemployed' },
  ]}
/>
```

---

## 🔧 Custom Validation Rules

### Age Validation:

```typescript
birthYear: {
  required: true,
  custom: (value: string) => {
    const year = parseInt(value);
    const currentYear = new Date().getFullYear();
    
    if (year < 1900 || year > currentYear) {
      return `Year must be between 1900 and ${currentYear}`;
    }
    
    if (year > currentYear - 15) {
      return 'Trainee must be at least 15 years old';
    }
    
    return null; // No error
  }
}
```

---

### Email Validation:

```typescript
email: {
  required: true,
  pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  custom: (value: string) => {
    if (value && !value.endsWith('.com') && !value.endsWith('.ph')) {
      return 'Please use .com or .ph email';
    }
    return null;
  }
}
```

---

### Phone Number Validation:

```typescript
phoneNumber: {
  required: true,
  pattern: /^(09|\+639)\d{9}$/,
  custom: (value: string) => {
    if (value && !value.startsWith('09')) {
      return 'Phone number must start with 09';
    }
    return null;
  }
}
```

---

## 🎯 How to Apply to Your Form

### Step 1: Import Components

```typescript
import { ValidatedInput } from '@/components/ui/validated-input';
import { ValidatedSelect } from '@/components/ui/validated-select';
import { ValidatedCheckboxGroup } from '@/components/ui/validated-checkbox-group';
import { useFormValidation } from '@/hooks/useFormValidation';
```

---

### Step 2: Define Validation Rules

```typescript
const VALIDATION_RULES = {
  firstName: {
    required: true,
    minLength: 2,
    maxLength: 50,
  },
  // More rules...
};
```

---

### Step 3: Initialize Hook

```typescript
const {
  values,
  errors,
  touched,
  handleChange,
  handleBlur,
  validateAll,
  incompleteCount,
} = useFormValidation<YourFormData>(
  initialValues,
  VALIDATION_RULES
);
```

---

### Step 4: Use Components

```typescript
<ValidatedInput
  label="First Name"
  name="firstName"
  value={values.firstName}
  onChange={(e) => handleChange('firstName', e.target.value)}
  onBlur={() => handleBlur('firstName')}
  error={errors.firstName}
  touched={touched.firstName}
  required
/>
```

---

### Step 5: Handle Submit

```typescript
const handleSubmit = (e: React.FormEvent) => {
  e.preventDefault();

  // Show warning if incomplete
  if (incompleteCount > 0) {
    toast.error(`Please complete ${incompleteCount} required field(s)`);
  }

  // Validate all
  const isValid = validateAll();

  if (isValid) {
    toast.success('Form is valid!');
    // Submit to API
  }
};
```

---

## 📊 Validation Flow

```
User Types → Field Changes → Instant Validation ✓

User Leaves Field → Blur Event → Show Errors ✓

User Clicks Submit → Validate All → Show Toast ✓

All Valid → Submit to API → Success ✓
```

---

## 🎨 Customization

### Change Error Color:

```typescript
// In validated-input.tsx, line with hasError
className={cn(
  hasError
    ? 'border-red-500 focus:border-red-500 focus:ring-red-200' // ← Change to orange
    : 'border-slate-300 focus:border-emerald-500'
)}
```

---

### Change Required Indicator:

```typescript
// In ValidatedInput component
{required && <span className="ml-1 text-red-600">*</span>}
// Change to: (Required)
{required && <span className="ml-1 text-xs text-slate-500">(Required)</span>}
```

---

### Add Success State (Green Border):

```typescript
const isValid = touched[fieldName] && !errors[fieldName] && values[fieldName];

className={cn(
  hasError
    ? 'border-red-500 ...'
    : isValid
      ? 'border-green-500 focus:border-green-500 focus:ring-green-200'
      : 'border-slate-300 ...'
)}
```

---

## 🐛 Common Issues

### Issue: Validation not triggering

**Solution:** Make sure you call `onBlur`:

```typescript
<ValidatedInput
  ...
  onBlur={() => handleBlur('fieldName')} // ← Important!
/>
```

---

### Issue: Error persists after correction

**Solution:** Error should auto-clear when typing. Check if `handleChange` is called:

```typescript
onChange={(e) => handleChange('fieldName', e.target.value)} // ← Correct
```

---

### Issue: Form submits with errors

**Solution:** Use `validateAll()` before submit:

```typescript
const isValid = validateAll();
if (!isValid) {
  return; // Don't submit
}
```

---

## ✅ Testing Checklist

- [ ] Red border appears on invalid field
- [ ] Error message shows below field
- [ ] Error clears when corrected
- [ ] Required asterisk (*) displays
- [ ] Toast notification appears on submit
- [ ] Incomplete count updates correctly
- [ ] Age auto-calculates from birth year
- [ ] Checkbox groups show error state
- [ ] Submit button text changes
- [ ] Save draft works

---

## 🎉 Result

**BEFORE:**
- ❌ No validation
- ❌ Users submit incomplete forms
- ❌ Errors only after submit
- ❌ Poor UX

**AFTER:**
- ✅ Real-time validation
- ✅ Clear error messages
- ✅ Visual feedback (red borders, icons)
- ✅ Toast notifications
- ✅ Incomplete field counter
- ✅ Professional, accessible UI

---

## 📚 Next Steps

1. ✅ Test the example form
2. ✅ Copy validation rules to your form
3. ✅ Replace existing inputs with validated components
4. ✅ Test all validation scenarios
5. ✅ Customize colors/messages if needed

---

**Created:** January 2026  
**Status:** ✅ Ready to Use  
**Files:** 5 components + 1 example form  
**Lines of Code:** ~800 lines
